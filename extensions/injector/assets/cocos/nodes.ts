/**
 * Nodes and components (VContainer's Unity extensions):
 *
 *     container.instantiate(prefab, parent);     // instantiate + inject (before onLoad)
 *     container.injectNode(node);                // inject every component of a node tree
 *
 *     builder.registerComponent(this.hud);                         // a component of the scene
 *     builder.registerComponentInHierarchy(HudView);              // found in the scene
 *     builder.registerComponentOnNewNode(AudioPlayer, Lifetime.Singleton, 'Audio').dontDestroyOnLoad();
 *     builder.registerComponentInNewPrefab(enemyPrefab, Enemy, Lifetime.Transient).under(this.enemyRoot);
 */
import { Component, director, instantiate, isValid, Node, Prefab } from 'cc';
import { ContainerBuilder, Lifetime, Registration, RegistrationBuilder } from '../core/builder';
import { Container } from '../core/container';
import { injectionInfo } from '../core/inject';
import { Class, classNameOf } from '../core/token';

declare module '../core/container' {
    interface Container {
        /** Instantiates a prefab (or clones a node), injects its components, then adds it under `parent`. */
        instantiate(original: Prefab | Node, parent?: Node | null): Node;
        /** Injects every component of `node` and its children (inactive ones too). */
        injectNode(node: Node): void;
    }
}

declare module '../core/builder' {
    interface ContainerBuilder {
        /** A component that already exists (injected when the scope is built). */
        registerComponent<T extends Component>(component: T): RegistrationBuilder<T>;
        /** The first `type` component found in the scope's scene (inactive nodes too). */
        registerComponentInHierarchy<T extends Component>(type: Class<T>): RegistrationBuilder<T>;
        /** A new node with a `type` component, made when first resolved. */
        registerComponentOnNewNode<T extends Component>(type: Class<T>, lifetime: Lifetime, nodeName?: string): ComponentRegistrationBuilder<T>;
        /** An instance of `prefab` (its `type` component), made when first resolved. */
        registerComponentInNewPrefab<T extends Component>(prefab: Prefab, type: Class<T>, lifetime: Lifetime): ComponentRegistrationBuilder<T>;
    }
}

// ----------------------------------------------------------- parent scopes

/**
 * Parents for LifetimeScopes that are about to be built: scopes inside an
 * instantiated prefab become children of the container that instantiated it.
 */
const overrides: Container[] = [];
const nodeParents = new WeakMap<Node, Container>();

/** Scopes built until dispose() get `parent` as their parent (VContainer's EnqueueParent). */
export function enqueueParent(parent: Container): { dispose(): void } {
    overrides.push(parent);
    let done = false;
    return {
        dispose() {
            if (done) return;
            done = true;
            const i = overrides.lastIndexOf(parent);
            if (i >= 0) overrides.splice(i, 1);
        },
    };
}

/** The parent given to a scope on `node`: enqueued, or from the prefab instance it is in. */
export function givenParent(node: Node): Container | null {
    for (let i = overrides.length - 1; i >= 0; i--) if (!overrides[i].disposed) return overrides[i];
    for (let n: Node | null = node; n; n = n.parent) {
        const c = nodeParents.get(n);
        if (c && !c.disposed) return c;
    }
    return null;
}

// --------------------------------------------------------------- injection

const injectedBy = new WeakMap<Container, WeakSet<object>>();

function markInjected(c: Container, obj: object): boolean {
    let set = injectedBy.get(c);
    if (!set) injectedBy.set(c, (set = new WeakSet()));
    if (set.has(obj)) return false;
    set.add(obj);
    return true;
}

export function nodePath(node: Node | null): string {
    const parts: string[] = [];
    for (let n = node; n && n.parent; n = n.parent) parts.unshift(n.name);
    return parts.join('/');
}

/** True for LifetimeScope components (set by lifetime-scope.ts; avoids a circular import). */
export function isScopeComponent(c: any): boolean {
    return !!c && c.__lifetimeScope === true;
}

function injectNodeImpl(this: Container, node: Node): void {
    const own = this.scope && this.scope.node;
    const walk = (n: Node) => {
        // A node with another LifetimeScope is that scope's business.
        if (n !== own && n.components.some((c) => isScopeComponent(c) && c !== this.scope)) return;
        for (const comp of n.components) {
            if (!injectionInfo(comp.constructor).any || !markInjected(this, comp)) continue;
            this.inject(comp, nodePath(n));
        }
        for (const child of n.children) walk(child);
    };
    walk(node);
}

const coreInstantiate = Container.prototype.instantiate as any;

function instantiateImpl(this: Container, original: any, parent?: Node | null): any {
    if (typeof original === 'function') return coreInstantiate.call(this, original);
    if (!original) throw new Error('[Injector] instantiate(): the prefab is ' + original + '.');
    const node = instantiate(original) as Node;
    // Not in the scene yet: injected before any onLoad.
    this.injectNode(node);
    nodeParents.set(node, this);
    if (parent) {
        const h = enqueueParent(this);
        try {
            node.parent = parent;
        } finally {
            h.dispose();
        }
    }
    return node;
}

(Container.prototype as any).instantiate = instantiateImpl;
(Container.prototype as any).injectNode = injectNodeImpl;

// ----------------------------------------------------------- registrations

export class ComponentRegistrationBuilder<T> extends RegistrationBuilder<T> {
    /** Parent node of the new node (default: the scene root). */
    under(node: Node | null): this {
        optionsOf(this.registration).parent = node;
        return this;
    }

    /** Keep the new node when the scene changes (a persistent root node). */
    dontDestroyOnLoad(): this {
        optionsOf(this.registration).persistent = true;
        return this;
    }
}

interface NodeOptions {
    parent: Node | null;
    persistent: boolean;
}

const nodeOptions = new WeakMap<Registration, NodeOptions>();

function optionsOf(r: Registration): NodeOptions {
    let o = nodeOptions.get(r);
    if (!o) nodeOptions.set(r, (o = { parent: null, persistent: false }));
    return o;
}

function sceneOf(builder: ContainerBuilder): Node | null {
    const n: Node | null = builder.scope?.node || null;
    return (n && (n as any).scene) || director.getScene();
}

function place(node: Node, reg: Registration, builder: ContainerBuilder, c: Container): void {
    const o = optionsOf(reg);
    const parent = o.persistent ? director.getScene() : o.parent && isValid(o.parent) ? o.parent : sceneOf(builder);
    if (!parent) return;
    const h = enqueueParent(c);
    try {
        node.parent = parent;
    } finally {
        h.dispose();
    }
    if (o.persistent) director.addPersistRootNode(node);
}

function destroyNodeOf(comp: Component): void {
    if (comp && isValid(comp.node, true)) comp.node.destroy();
}

const B = ContainerBuilder.prototype as any;

B.registerComponent = function (this: ContainerBuilder, component: Component) {
    if (!component) throw new Error('[Injector] registerComponent(): the component is ' + component + '.');
    const b = this.registerInstance(component);
    // Before the entry points start.
    this.registerBuildCallback((c) => {
        if (markInjected(c, component)) c.inject(component, nodePath(component.node));
    });
    return b;
};

B.registerComponentInHierarchy = function (this: ContainerBuilder, type: Class<Component>) {
    const scene = sceneOf(this);
    const found = scene ? findComponent(scene, type) : null;
    if (!found) throw new Error(`[Injector] registerComponentInHierarchy(${classNameOf(type)}): there is none in the scene.`);
    return this.registerComponent(found);
};

B.registerComponentOnNewNode = function (this: ContainerBuilder, type: Class<Component>, lifetime: Lifetime, nodeName?: string) {
    const builder = this;
    const reg: Registration = new Registration('component', lifetime, type, (c) => {
        const node = new Node(nodeName || classNameOf(type));
        const comp = node.addComponent(type as any) as Component;
        c.injectNode(node);
        place(node, reg, builder, c);
        return comp;
    });
    reg.release = destroyNodeOf;
    this.add(reg);
    return new ComponentRegistrationBuilder(reg);
};

B.registerComponentInNewPrefab = function (this: ContainerBuilder, prefab: Prefab, type: Class<Component>, lifetime: Lifetime) {
    if (!prefab) throw new Error(`[Injector] registerComponentInNewPrefab(${classNameOf(type)}): the prefab is ${prefab}.`);
    const builder = this;
    const reg: Registration = new Registration('component', lifetime, type, (c) => {
        const node = instantiate(prefab) as Node;
        const comp = (node.getComponent(type as any) || node.getComponentInChildren(type as any)) as Component | null;
        if (!comp) {
            node.destroy();
            throw new Error(`[Injector] The prefab ${prefab.name} has no ${classNameOf(type)}.`);
        }
        c.injectNode(node);
        nodeParents.set(node, c);
        place(node, reg, builder, c);
        return comp;
    });
    reg.release = destroyNodeOf;
    this.add(reg);
    return new ComponentRegistrationBuilder(reg);
};

/** First component of `type` under `root`, inactive nodes included. */
export function findComponent<T extends Component>(root: Node, type: Class<T>): T | null {
    const c = root.getComponent(type as any) as T | null;
    if (c) return c;
    for (const child of root.children) {
        const found = findComponent(child, type);
        if (found) return found;
    }
    return null;
}

/** Every component of `type` under `root`, inactive nodes included. */
export function findComponents<T extends Component>(root: Node, type: Class<T> | Function, out: T[] = []): T[] {
    for (const c of root.components) if (c instanceof (type as any)) out.push(c as T);
    for (const child of root.children) findComponents(child, type, out);
    return out;
}
