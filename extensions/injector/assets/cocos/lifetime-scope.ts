/**
 * LifetimeScope (VContainer's LifetimeScope): a component that builds a
 * container for its scene when it loads, then injects the nodes listed in
 * Auto Inject Nodes, before their onLoad.
 *
 *     @ccclass('GameLifetimeScope')
 *     export class GameLifetimeScope extends LifetimeScope {
 *         @property(GameConfig) config: GameConfig | null = null;
 *
 *         protected configure(builder: ContainerBuilder) {
 *             builder.register(AudioService, Lifetime.Singleton);
 *             builder.register(AdMobAds, Lifetime.Singleton).as(IAds);
 *             builder.registerInstance(this.config!);
 *             builder.registerEntryPoint(GamePresenter);
 *         }
 *     }
 *
 * Parent: the scope of the type chosen in Parent (any loaded scene), else
 * the root scope: a prefab named RootLifetimeScope in a resources folder,
 * created before the first scene and kept across scenes.
 */
import {
    _decorator, assetManager, CCClass, Component, director, Director, Enum, game, instantiate, isValid, js, Node, Prefab, Scene,
} from 'cc';
import { EDITOR, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { ContainerBuilder, Installer } from '../core/builder';
import { Container } from '../core/container';
import { Class } from '../core/token';
import { enqueueParent as enqueueParentContainer, findComponents, givenParent } from './nodes';

const { ccclass, property, executionOrder, menu, disallowMultiple } = _decorator;

/** Path of the root scope prefab inside a resources folder. */
export const ROOT_SCOPE_PATH = 'RootLifetimeScope';

const WAIT = Symbol('wait');
type ParentResult = Container | null | typeof WAIT;

const ParentType = Enum({ None: 0 });

/** Scopes waiting for their parent to be built. */
const waiting = new Set<LifetimeScope>();
const extraInstallers: Installer[] = [];
const roots = new WeakSet<LifetimeScope>();

@ccclass('LifetimeScope')
@executionOrder(-5000)
@disallowMultiple
@menu('Injector/LifetimeScope')
export class LifetimeScope extends Component {
    /** Every loaded scope. */
    static readonly all: LifetimeScope[] = [];

    /** Type name (cc class name) of the parent scope; empty: the root scope. */
    @property({ visible: false })
    parentReference = '';

    @property({ tooltip: 'Build the container when this node loads. Off: call build() yourself.' })
    autoRun = true;

    @property({ type: [Node], tooltip: 'These nodes and their children get their @inject members filled when the container is built, before their onLoad.' })
    autoInjectNodes: Node[] = [];

    /** The container, once built. */
    container: Container | null = null;
    /** True once disposed (destroyed). */
    disposed = false;
    private building = false;
    private warnedWait = false;

    /** The parent shown as a dropdown of the scope types in the project. */
    @property({ type: ParentType, displayName: 'Parent', tooltip: 'The scope this one is a child of: the first loaded scope of this type, in any scene. None: the root scope (resources/RootLifetimeScope), if there is one.' })
    get parentType(): number {
        const ref = this.parentReference;
        const i = ref ? parentChoices(this).findIndex((n) => n === ref || n === `${ref} (missing)`) : (parentChoices(this), -1);
        return i < 0 ? 0 : i + 1;
    }

    set parentType(v: number) {
        const names = parentChoices(this);
        this.parentReference = v > 0 && v <= names.length ? names[v - 1].replace(/ \(missing\)$/, '') : '';
    }

    /** True for the scope made from resources/RootLifetimeScope. */
    get isRoot(): boolean {
        return roots.has(this);
    }

    /** Registrations of this scope (VContainer's Configure). */
    protected configure(_builder: ContainerBuilder): void {}

    // ------------------------------------------------------------- static

    /** The first loaded scope of a type (class or cc class name). */
    static find<T extends LifetimeScope>(type?: Class<T> | string): T | null {
        return (findScope(type || LifetimeScope, null) as T) || null;
    }

    /** Extra registrations for every scope built until dispose() (VContainer's Enqueue), e.g. data for the next scene. */
    static enqueue(installer: Installer): { dispose(): void } {
        extraInstallers.push(installer);
        return {
            dispose() {
                const i = extraInstallers.indexOf(installer);
                if (i >= 0) extraInstallers.splice(i, 1);
            },
        };
    }

    /** Scopes built until dispose() become children of `parent` (VContainer's EnqueueParent). */
    static enqueueParent(parent: LifetimeScope | Container): { dispose(): void } {
        const c = parent instanceof LifetimeScope ? parent.container : parent;
        if (!c) throw new Error('[Injector] enqueueParent(): the parent scope is not built yet.');
        return enqueueParentContainer(c);
    }

    /** The root scope (resources/RootLifetimeScope), or null. */
    static get root(): LifetimeScope | null {
        const r = ensureRoot();
        return r === WAIT ? null : rootScope;
    }

    // ---------------------------------------------------------- lifecycle

    onLoad() {
        if (!LifetimeScope.all.includes(this)) LifetimeScope.all.push(this);
        if (this.autoRun) this.build();
    }

    onDestroy() {
        this.dispose();
    }

    /**
     * Builds the container (once). Returns false while the parent isn't
     * available yet (it builds as soon as it is) or when the build failed.
     */
    build(): boolean {
        if (this.container) return true;
        if (this.building || this.disposed) return false;
        if (!LifetimeScope.all.includes(this)) LifetimeScope.all.push(this);
        this.building = true;
        let parent: ParentResult;
        try {
            parent = this.findParent();
        } finally {
            this.building = false;
        }
        if (parent === WAIT) {
            waiting.add(this);
            if (!this.warnedWait) {
                this.warnedWait = true;
                console.warn(`[Injector] ${this.scopeName} waits for its parent (${this.parentReference || ROOT_SCOPE_PATH}); it is built as soon as the parent is.`);
            }
            return false;
        }
        waiting.delete(this);
        this.building = true;
        try {
            const b = new ContainerBuilder(parent, this.scopeName);
            b.scope = this;
            b.registerInstance(this).as(LifetimeScope).asSelf();
            if (!this.isRoot) for (const fn of extraInstallers.slice()) fn(b);
            this.configure(b);
            this.container = b.build();
        } catch (e) {
            const msg = (e as Error)?.message || '';
            console.error(msg.startsWith('[Injector]') ? msg : e);
            return false;
        } finally {
            this.building = false;
        }
        for (const n of this.autoInjectNodes) {
            if (!n || !isValid(n, true)) continue;
            try {
                this.container.injectNode(n);
            } catch (e) {
                console.error((e as Error)?.message || e);
            }
        }
        retryWaiting();
        return true;
    }

    /** Disposes the container (and child scopes). Called when the node is destroyed. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        waiting.delete(this);
        const i = LifetimeScope.all.indexOf(this);
        if (i >= 0) LifetimeScope.all.splice(i, 1);
        this.container?.dispose();
        this.container = null;
        if (rootScope === this) rootScope = null;
    }

    /** A child scope on a new node under this one (VContainer's CreateChild). */
    createChild(installer?: Installer, name = 'LifetimeScope (Child)'): LifetimeScope {
        if (!this.container) throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        const node = new Node(name);
        const scope = node.addComponent(LifetimeScope);
        scope.autoRun = false;
        const extra = installer ? LifetimeScope.enqueue(installer) : null;
        const h = enqueueParentContainer(this.container);
        try {
            node.parent = this.node;
            scope.build();
        } finally {
            h.dispose();
            extra?.dispose();
        }
        return scope;
    }

    /** Instantiates a prefab whose root has a LifetimeScope, as a child scope of this one. */
    createChildFromPrefab<T extends LifetimeScope>(prefab: Prefab, installer?: Installer, parent: Node = this.node): T {
        if (!this.container) throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        const extra = installer ? LifetimeScope.enqueue(installer) : null;
        try {
            const node = this.container.instantiate(prefab, parent);
            const scope = node.getComponent(LifetimeScope) as T | null;
            if (!scope) throw new Error(`[Injector] The prefab ${prefab.name} has no LifetimeScope on its root.`);
            if (!scope.container) scope.build();
            return scope;
        } finally {
            extra?.dispose();
        }
    }

    /** Shortcut for container.instantiate(). */
    instantiate(original: Prefab | Node, parent?: Node | null): Node {
        if (!this.container) throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        return this.container.instantiate(original, parent);
    }

    /** The scope's name in messages and the Diagnostics window. */
    get scopeName(): string {
        const type = js.getClassName(this.constructor) || 'LifetimeScope';
        return type === 'LifetimeScope' ? `LifetimeScope (${this.node?.name || '?'})` : type;
    }

    private findParent(): ParentResult {
        if (this.isRoot) return null;
        const given = givenParent(this.node);
        if (given) return given;
        if (this.parentReference) {
            const s = findScope(this.parentReference, this);
            if (!s || !s.node.activeInHierarchy && !s.container) return WAIT;
            if (!s.container && !s.build()) return WAIT;
            return s.container;
        }
        const root = ensureRoot();
        if (root === WAIT) return WAIT;
        if (!root || root === this) return null;
        if (!root.container && !root.build()) return root.disposed ? null : WAIT;
        return root.container;
    }
}

// Marks scope components for nodes.ts (no circular import).
(LifetimeScope.prototype as any).__lifetimeScope = true;

function retryWaiting(): void {
    for (const s of [...waiting]) {
        if (!waiting.has(s)) continue;
        if (!isValid(s, true) || s.disposed) {
            waiting.delete(s);
            continue;
        }
        s.build();
    }
}

/** A loaded (or not yet loaded) scope of a type, built ones first. */
function findScope(type: Function | string, exclude: LifetimeScope | null): LifetimeScope | null {
    const cls: any = typeof type === 'string' ? js.getClassByName(type) : type;
    const matches = (s: LifetimeScope) =>
        s !== exclude && !s.disposed && isValid(s, true) && (cls ? s instanceof cls : js.getClassName(s.constructor) === type);
    const loaded = LifetimeScope.all.filter(matches);
    const built = loaded.find((s) => !!s.container);
    if (built || loaded.length) return built || loaded[0];
    // Scopes of the scene that haven't loaded yet (their onLoad comes later in this frame).
    const scene = director.getScene();
    if (!scene) return null;
    return (findComponents(scene, LifetimeScope) as LifetimeScope[]).find(matches) || null;
}

// --------------------------------------------------------------- root scope

let rootPrefab: Prefab | null = null;
let rootLoading = false;
let rootScope: LifetimeScope | null = null;
/** The scene being launched (BEFORE_SCENE_LAUNCH comes before director.getScene() returns it). */
let launching: Scene | null = null;

function ensureRoot(): LifetimeScope | null | typeof WAIT {
    if (rootScope && !rootScope.disposed && isValid(rootScope, true)) return rootScope;
    rootScope = null;
    if (rootPrefab && isValid(rootPrefab)) return createRoot(rootPrefab);
    return rootLoading ? WAIT : null;
}

function createRoot(prefab: Prefab): LifetimeScope | null {
    const node = instantiate(prefab) as Node;
    const scope = node.getComponent(LifetimeScope);
    if (!scope) {
        console.error(`[Injector] resources/${ROOT_SCOPE_PATH} has no LifetimeScope on its root node.`);
        rootPrefab = null;
        node.destroy();
        return null;
    }
    roots.add(scope);
    rootScope = scope;
    const scene = director.getScene() || launching;
    if (scene) node.parent = scene;
    director.addPersistRootNode(node);
    // Built now, even when its node becomes active later (with the scene).
    scope.build();
    return scope;
}

/** Loads resources/RootLifetimeScope when there is one. */
function loadRoot(): Promise<void> {
    if (rootPrefab || rootLoading) return Promise.resolve();
    const bundle = assetManager.resources;
    if (!bundle || !bundle.getInfoWithPath(ROOT_SCOPE_PATH, Prefab)) return Promise.resolve();
    rootLoading = true;
    return new Promise<void>((resolve) => {
        bundle.load(ROOT_SCOPE_PATH, Prefab, (err: Error | null, prefab: Prefab) => {
            rootLoading = false;
            if (err || !prefab) console.error(`[Injector] Could not load resources/${ROOT_SCOPE_PATH}:`, err);
            else rootPrefab = prefab;
            resolve();
            // Scopes of a running scene may be waiting (Play in Editor).
            if (director.getScene()) {
                ensureRoot();
                retryWaiting();
            }
        });
    });
}

/** Testing and tools: forget the root scope state. */
export function resetRootScope(): void {
    rootPrefab = null;
    rootLoading = false;
    rootScope = null;
}

if (!EDITOR_NOT_IN_PREVIEW) {
    // Ready before the first scene (game.init waits for this promise).
    if (!game.inited) game.onPostProjectInitDelegate.add(loadRoot);
    else loadRoot();
    director.on(Director.EVENT_BEFORE_SCENE_LAUNCH, (scene: Scene) => {
        launching = scene;
        try {
            if (!rootPrefab && !rootLoading) loadRoot();
            ensureRoot();
        } finally {
            launching = null;
        }
    });
}

// ------------------------------------------------- Inspector: Parent dropdown

let lastChoices: string[] = [];

/** Scope types for the Parent dropdown (editor): every LifetimeScope class but the scope's own. */
function parentChoices(scope: LifetimeScope): string[] {
    if (!EDITOR) return lastChoices;
    const own = scope.constructor;
    const names: string[] = [];
    const table = (js as any)._nameToClass || {};
    for (const name of Object.keys(table)) {
        const cls = table[name];
        if (cls !== own && typeof cls === 'function' && (cls === LifetimeScope || cls.prototype instanceof LifetimeScope)) names.push(name);
    }
    names.sort();
    if (scope.parentReference && !names.includes(scope.parentReference)) names.push(`${scope.parentReference} (missing)`);
    lastChoices = names;
    const list = [{ name: 'None', value: 0 }, ...names.map((name, i) => ({ name, value: i + 1 }))];
    const Attr = (CCClass as any).Attr;
    if (Attr?.setClassAttr) {
        Attr.setClassAttr(own, 'parentType', 'enumList', list);
        if (own !== LifetimeScope) Attr.setClassAttr(LifetimeScope, 'parentType', 'enumList', list);
    }
    return names;
}
