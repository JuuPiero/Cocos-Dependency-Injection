/**
 * A small stand-in for 'cc' (aliased by tests/run.js): nodes, components,
 * scenes and the parts of the director, game and asset manager the
 * injector uses. Activation follows the engine: onLoad of a whole batch,
 * negative executionOrder first.
 */
type AnyClass = new (...args: any[]) => any;

const nameToClass: Record<string, AnyClass> = {};
const classToName = new Map<Function, string>();

export const js = {
    _nameToClass: nameToClass,
    getClassName(objOrCtor: any): string {
        const ctor = typeof objOrCtor === 'function' ? objOrCtor : objOrCtor?.constructor;
        return (ctor && classToName.get(ctor)) || ctor?.name || '';
    },
    getClassByName(name: string): AnyClass | undefined {
        return nameToClass[name];
    },
};

export function isValid(o: any, _strict?: boolean): boolean {
    return !!o && o.isValid !== false;
}

export function Enum<T>(o: T): T {
    return o;
}

export const CCClass = { Attr: { setClassAttr() {} } };

const noopDecorator = (...a: any[]): any => {
    // @property and @property({...}) both work.
    if (a.length >= 2 && typeof a[1] === 'string') return undefined;
    return () => undefined;
};

export const _decorator = {
    ccclass(name: string) {
        return (cls: AnyClass) => {
            nameToClass[name] = cls;
            classToName.set(cls, name);
        };
    },
    property: noopDecorator,
    executionOrder(order: number) {
        return (cls: any) => {
            cls._executionOrder = order;
        };
    },
    menu: () => () => undefined,
    disallowMultiple: (cls: any) => cls,
};

let nextUuid = 1;

export class Component {
    static _executionOrder = 0;
    node: Node = null as any;
    isValid = true;
    uuid = `c${nextUuid++}`;
    get name() {
        return this.node?.name || '';
    }
}

export class Node {
    name: string;
    uuid = `n${nextUuid++}`;
    children: Node[] = [];
    components: Component[] = [];
    isValid = true;
    private _parent: Node | null = null;
    private _active = true;
    _activeInHierarchy = false;
    _persistNode = false;

    constructor(name = 'New Node') {
        this.name = name;
    }

    get parent(): Node | null {
        return this._parent;
    }

    set parent(p: Node | null) {
        this.setParent(p);
    }

    setParent(p: Node | null): void {
        if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1);
        this._parent = p;
        if (p) p.children.push(this);
        const should = !!p && p._activeInHierarchy && this._active;
        if (should && !this._activeInHierarchy) activate(this);
        else if (!should) deactivate(this);
    }

    get active(): boolean {
        return this._active;
    }

    set active(v: boolean) {
        this._active = v;
        const should = v && (!this._parent || this._parent._activeInHierarchy) && (this._parent !== null || this instanceof Scene);
        if (should && !this._activeInHierarchy) activate(this);
        else if (!v) deactivate(this);
    }

    get activeInHierarchy(): boolean {
        return this._activeInHierarchy;
    }

    get scene(): Scene | null {
        let n: Node = this;
        while (n._parent) n = n._parent;
        return n instanceof Scene ? n : null;
    }

    addComponent<T>(type: new () => T): T {
        const c = new (type as any)() as Component;
        c.node = this;
        this.components.push(c);
        if (this._activeInHierarchy) runLoad([c]);
        return c as any;
    }

    getComponent<T>(type: any): T | null {
        const cls = typeof type === 'string' ? nameToClass[type] : type;
        return (this.components.find((c) => c instanceof cls) as any) || null;
    }

    getComponentInChildren<T>(type: any): T | null {
        const own = this.getComponent<T>(type);
        if (own) return own;
        for (const ch of this.children) {
            const f = ch.getComponentInChildren<T>(type);
            if (f) return f;
        }
        return null;
    }

    getChildByName(name: string): Node | null {
        return this.children.find((c) => c.name === name) || null;
    }

    destroy(): boolean {
        if (!this.isValid) return false;
        for (const ch of [...this.children]) ch.destroy();
        for (const c of this.components) {
            c.isValid = false;
            (c as any).onDestroy?.();
        }
        this.isValid = false;
        if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1);
        this._parent = null;
        this._activeInHierarchy = false;
        return true;
    }
}

export class Scene extends Node {}

/** Like the engine: mark the tree active, then onLoad for the whole batch (negative order first). */
function activate(root: Node): void {
    const batch: Component[] = [];
    const walk = (n: Node) => {
        if (!n.active) return;
        n._activeInHierarchy = true;
        batch.push(...n.components);
        for (const ch of n.children) walk(ch);
    };
    walk(root);
    runLoad(batch);
}

function deactivate(root: Node): void {
    root._activeInHierarchy = false;
    for (const ch of root.children) deactivate(ch);
}

const loaded = new WeakSet<Component>();

function runLoad(batch: Component[]): void {
    const order = (c: Component) => (c.constructor as any)._executionOrder || 0;
    const sorted = batch.slice().sort((a, b) => order(a) - order(b));
    for (const c of sorted) {
        if (loaded.has(c) || !c.isValid) continue;
        loaded.add(c);
        (c as any).onLoad?.();
    }
}

export class Prefab {
    constructor(readonly data: Node, readonly name = data.name) {}
}

/** Clones a node tree; components are copied field by field. */
export function instantiate(original: Prefab | Node): Node {
    const src = original instanceof Prefab ? original.data : original;
    const clone = (n: Node): Node => {
        const copy = new Node(n.name);
        copy.active = n.active;
        for (const c of n.components) {
            const cc = new (c.constructor as any)() as Component;
            for (const k of Object.keys(c)) if (k !== 'node' && k !== 'uuid') (cc as any)[k] = (c as any)[k];
            cc.node = copy;
            copy.components.push(cc);
        }
        for (const ch of n.children) clone(ch).setParent(copy);
        return copy;
    };
    return clone(src);
}

type Listener = { fn: (...a: any[]) => void; once: boolean };

class Emitter {
    private listeners = new Map<string, Listener[]>();
    on(type: string, fn: (...a: any[]) => void) {
        (this.listeners.get(type) || this.listeners.set(type, []).get(type)!).push({ fn, once: false });
    }
    once(type: string, fn: (...a: any[]) => void) {
        (this.listeners.get(type) || this.listeners.set(type, []).get(type)!).push({ fn, once: true });
    }
    off(type: string, fn: (...a: any[]) => void) {
        const l = this.listeners.get(type);
        if (l) this.listeners.set(type, l.filter((x) => x.fn !== fn));
    }
    emit(type: string, ...args: any[]) {
        const l = this.listeners.get(type) || [];
        this.listeners.set(type, l.filter((x) => !x.once));
        for (const x of l) x.fn(...args);
    }
}

export const Director = {
    EVENT_BEFORE_UPDATE: 'before-update',
    EVENT_AFTER_UPDATE: 'after-update',
    EVENT_BEFORE_SCENE_LAUNCH: 'before-scene-launch',
};

export class Scheduler {
    static enableForTarget(t: any) {
        t.id = t.id || `s${nextUuid++}`;
    }
}

const updateTargets: any[] = [];

class FakeDirector extends Emitter {
    private _scene: Scene | null = null;
    private persist: Node[] = [];

    getScene(): Scene | null {
        return this._scene;
    }

    getScheduler() {
        return { scheduleUpdate: (t: any) => updateTargets.push(t) };
    }

    addPersistRootNode(node: Node) {
        if (!this.persist.includes(node)) this.persist.push(node);
        node._persistNode = true;
    }

    /** Like runSceneImmediate: persist nodes move over, BEFORE_SCENE_LAUNCH, old scene destroyed, then activation. */
    runScene(scene: Scene) {
        this.persist = this.persist.filter((n) => n.isValid);
        for (const n of this.persist) n.setParent(scene);
        const old = this._scene;
        if (old) old.destroy();
        this._scene = null;
        this.emit(Director.EVENT_BEFORE_SCENE_LAUNCH, scene);
        this._scene = scene;
        scene.active = true;
    }

    /** One frame: before update, (components), scheduler, (late update), after update. */
    tick(dt = 1 / 60) {
        this.emit(Director.EVENT_BEFORE_UPDATE);
        for (const t of updateTargets) t.update(dt);
        this.emit(Director.EVENT_AFTER_UPDATE);
    }
}

export const director = new FakeDirector();

export const game = {
    inited: true,
    deltaTime: 1 / 60,
    onPostProjectInitDelegate: { add() {} },
};

/** Set `assetManager.resources` to a FakeBundle to give the tests a root scope prefab. */
export class FakeBundle {
    constructor(private readonly assets: Record<string, any>) {}
    getInfoWithPath(path: string) {
        return this.assets[path] ? { path } : null;
    }
    load(path: string, _type: any, cb: (err: Error | null, asset: any) => void) {
        setTimeout(() => cb(this.assets[path] ? null : new Error('missing'), this.assets[path]), 1);
    }
}

export const assetManager: { resources: FakeBundle | null } = { resources: null };
