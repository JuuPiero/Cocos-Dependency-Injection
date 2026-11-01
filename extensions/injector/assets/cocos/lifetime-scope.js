"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LifetimeScope_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LifetimeScope = exports.ROOT_SCOPE_PATH = void 0;
exports.resetRootScope = resetRootScope;
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
const cc_1 = require("cc");
const env_1 = require("cc/env");
const builder_1 = require("../core/builder");
const nodes_1 = require("./nodes");
const { ccclass, property, executionOrder, menu, disallowMultiple } = cc_1._decorator;
/** Path of the root scope prefab inside a resources folder. */
exports.ROOT_SCOPE_PATH = 'RootLifetimeScope';
const WAIT = Symbol('wait');
const ParentType = (0, cc_1.Enum)({ None: 0 });
/** Scopes waiting for their parent to be built. */
const waiting = new Set();
const extraInstallers = [];
const roots = new WeakSet();
let LifetimeScope = LifetimeScope_1 = class LifetimeScope extends cc_1.Component {
    constructor() {
        super(...arguments);
        /** Type name (cc class name) of the parent scope; empty: the root scope. */
        this.parentReference = '';
        this.autoRun = true;
        this.autoInjectNodes = [];
        /** The container, once built. */
        this.container = null;
        /** True once disposed (destroyed). */
        this.disposed = false;
        this.building = false;
        this.warnedWait = false;
    }
    /** The parent shown as a dropdown of the scope types in the project. */
    get parentType() {
        const ref = this.parentReference;
        const i = ref ? parentChoices(this).findIndex((n) => n === ref || n === `${ref} (missing)`) : (parentChoices(this), -1);
        return i < 0 ? 0 : i + 1;
    }
    set parentType(v) {
        const names = parentChoices(this);
        this.parentReference = v > 0 && v <= names.length ? names[v - 1].replace(/ \(missing\)$/, '') : '';
    }
    /** True for the scope made from resources/RootLifetimeScope. */
    get isRoot() {
        return roots.has(this);
    }
    /** Registrations of this scope (VContainer's Configure). */
    configure(_builder) { }
    // ------------------------------------------------------------- static
    /** The first loaded scope of a type (class or cc class name). */
    static find(type) {
        return findScope(type || LifetimeScope_1, null) || null;
    }
    /** Extra registrations for every scope built until dispose() (VContainer's Enqueue), e.g. data for the next scene. */
    static enqueue(installer) {
        extraInstallers.push(installer);
        return {
            dispose() {
                const i = extraInstallers.indexOf(installer);
                if (i >= 0)
                    extraInstallers.splice(i, 1);
            },
        };
    }
    /** Scopes built until dispose() become children of `parent` (VContainer's EnqueueParent). */
    static enqueueParent(parent) {
        const c = parent instanceof LifetimeScope_1 ? parent.container : parent;
        if (!c)
            throw new Error('[Injector] enqueueParent(): the parent scope is not built yet.');
        return (0, nodes_1.enqueueParent)(c);
    }
    /** The root scope (resources/RootLifetimeScope), or null. */
    static get root() {
        const r = ensureRoot();
        return r === WAIT ? null : rootScope;
    }
    // ---------------------------------------------------------- lifecycle
    onLoad() {
        if (!LifetimeScope_1.all.includes(this))
            LifetimeScope_1.all.push(this);
        if (this.autoRun)
            this.build();
    }
    onDestroy() {
        this.dispose();
    }
    /**
     * Builds the container (once). Returns false while the parent isn't
     * available yet (it builds as soon as it is) or when the build failed.
     */
    build() {
        if (this.container)
            return true;
        if (this.building || this.disposed)
            return false;
        if (!LifetimeScope_1.all.includes(this))
            LifetimeScope_1.all.push(this);
        this.building = true;
        let parent;
        try {
            parent = this.findParent();
        }
        finally {
            this.building = false;
        }
        if (parent === WAIT) {
            waiting.add(this);
            if (!this.warnedWait) {
                this.warnedWait = true;
                console.warn(`[Injector] ${this.scopeName} waits for its parent (${this.parentReference || exports.ROOT_SCOPE_PATH}); it is built as soon as the parent is.`);
            }
            return false;
        }
        waiting.delete(this);
        this.building = true;
        try {
            const b = new builder_1.ContainerBuilder(parent, this.scopeName);
            b.scope = this;
            b.registerInstance(this).as(LifetimeScope_1).asSelf();
            if (!this.isRoot)
                for (const fn of extraInstallers.slice())
                    fn(b);
            this.configure(b);
            this.container = b.build();
        }
        catch (e) {
            const msg = (e === null || e === void 0 ? void 0 : e.message) || '';
            console.error(msg.startsWith('[Injector]') ? msg : e);
            return false;
        }
        finally {
            this.building = false;
        }
        for (const n of this.autoInjectNodes) {
            if (!n || !(0, cc_1.isValid)(n, true))
                continue;
            try {
                this.container.injectNode(n);
            }
            catch (e) {
                console.error((e === null || e === void 0 ? void 0 : e.message) || e);
            }
        }
        retryWaiting();
        return true;
    }
    /** Disposes the container (and child scopes). Called when the node is destroyed. */
    dispose() {
        var _a;
        if (this.disposed)
            return;
        this.disposed = true;
        waiting.delete(this);
        const i = LifetimeScope_1.all.indexOf(this);
        if (i >= 0)
            LifetimeScope_1.all.splice(i, 1);
        (_a = this.container) === null || _a === void 0 ? void 0 : _a.dispose();
        this.container = null;
        if (rootScope === this)
            rootScope = null;
    }
    /** A child scope on a new node under this one (VContainer's CreateChild). */
    createChild(installer, name = 'LifetimeScope (Child)') {
        if (!this.container)
            throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        const node = new cc_1.Node(name);
        const scope = node.addComponent(LifetimeScope_1);
        scope.autoRun = false;
        const extra = installer ? LifetimeScope_1.enqueue(installer) : null;
        const h = (0, nodes_1.enqueueParent)(this.container);
        try {
            node.parent = this.node;
            scope.build();
        }
        finally {
            h.dispose();
            extra === null || extra === void 0 ? void 0 : extra.dispose();
        }
        return scope;
    }
    /** Instantiates a prefab whose root has a LifetimeScope, as a child scope of this one. */
    createChildFromPrefab(prefab, installer, parent = this.node) {
        if (!this.container)
            throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        const extra = installer ? LifetimeScope_1.enqueue(installer) : null;
        try {
            const node = this.container.instantiate(prefab, parent);
            const scope = node.getComponent(LifetimeScope_1);
            if (!scope)
                throw new Error(`[Injector] The prefab ${prefab.name} has no LifetimeScope on its root.`);
            if (!scope.container)
                scope.build();
            return scope;
        }
        finally {
            extra === null || extra === void 0 ? void 0 : extra.dispose();
        }
    }
    /** Shortcut for container.instantiate(). */
    instantiate(original, parent) {
        if (!this.container)
            throw new Error(`[Injector] ${this.scopeName} is not built yet.`);
        return this.container.instantiate(original, parent);
    }
    /** The scope's name in messages and the Diagnostics window. */
    get scopeName() {
        var _a;
        const type = cc_1.js.getClassName(this.constructor) || 'LifetimeScope';
        return type === 'LifetimeScope' ? `LifetimeScope (${((_a = this.node) === null || _a === void 0 ? void 0 : _a.name) || '?'})` : type;
    }
    findParent() {
        if (this.isRoot)
            return null;
        const given = (0, nodes_1.givenParent)(this.node);
        if (given)
            return given;
        if (this.parentReference) {
            const s = findScope(this.parentReference, this);
            if (!s || !s.node.activeInHierarchy && !s.container)
                return WAIT;
            if (!s.container && !s.build())
                return WAIT;
            return s.container;
        }
        const root = ensureRoot();
        if (root === WAIT)
            return WAIT;
        if (!root || root === this)
            return null;
        if (!root.container && !root.build())
            return root.disposed ? null : WAIT;
        return root.container;
    }
};
exports.LifetimeScope = LifetimeScope;
/** Every loaded scope. */
LifetimeScope.all = [];
__decorate([
    property({ visible: false })
], LifetimeScope.prototype, "parentReference", void 0);
__decorate([
    property({ tooltip: 'Build the container when this node loads. Off: call build() yourself.' })
], LifetimeScope.prototype, "autoRun", void 0);
__decorate([
    property({ type: [cc_1.Node], tooltip: 'These nodes and their children get their @inject members filled when the container is built, before their onLoad.' })
], LifetimeScope.prototype, "autoInjectNodes", void 0);
__decorate([
    property({ type: ParentType, displayName: 'Parent', tooltip: 'The scope this one is a child of: the first loaded scope of this type, in any scene. None: the root scope (resources/RootLifetimeScope), if there is one.' })
], LifetimeScope.prototype, "parentType", null);
exports.LifetimeScope = LifetimeScope = LifetimeScope_1 = __decorate([
    ccclass('LifetimeScope'),
    executionOrder(-5000),
    disallowMultiple,
    menu('Injector/LifetimeScope')
], LifetimeScope);
// Marks scope components for nodes.ts (no circular import).
LifetimeScope.prototype.__lifetimeScope = true;
function retryWaiting() {
    for (const s of [...waiting]) {
        if (!waiting.has(s))
            continue;
        if (!(0, cc_1.isValid)(s, true) || s.disposed) {
            waiting.delete(s);
            continue;
        }
        s.build();
    }
}
/** A loaded (or not yet loaded) scope of a type, built ones first. */
function findScope(type, exclude) {
    const cls = typeof type === 'string' ? cc_1.js.getClassByName(type) : type;
    const matches = (s) => s !== exclude && !s.disposed && (0, cc_1.isValid)(s, true) && (cls ? s instanceof cls : cc_1.js.getClassName(s.constructor) === type);
    const loaded = LifetimeScope.all.filter(matches);
    const built = loaded.find((s) => !!s.container);
    if (built || loaded.length)
        return built || loaded[0];
    // Scopes of the scene that haven't loaded yet (their onLoad comes later in this frame).
    const scene = cc_1.director.getScene();
    if (!scene)
        return null;
    return (0, nodes_1.findComponents)(scene, LifetimeScope).find(matches) || null;
}
// --------------------------------------------------------------- root scope
let rootPrefab = null;
let rootLoading = false;
let rootScope = null;
/** The scene being launched (BEFORE_SCENE_LAUNCH comes before director.getScene() returns it). */
let launching = null;
function ensureRoot() {
    if (rootScope && !rootScope.disposed && (0, cc_1.isValid)(rootScope, true))
        return rootScope;
    rootScope = null;
    if (rootPrefab && (0, cc_1.isValid)(rootPrefab))
        return createRoot(rootPrefab);
    return rootLoading ? WAIT : null;
}
function createRoot(prefab) {
    const node = (0, cc_1.instantiate)(prefab);
    const scope = node.getComponent(LifetimeScope);
    if (!scope) {
        console.error(`[Injector] resources/${exports.ROOT_SCOPE_PATH} has no LifetimeScope on its root node.`);
        rootPrefab = null;
        node.destroy();
        return null;
    }
    roots.add(scope);
    rootScope = scope;
    const scene = cc_1.director.getScene() || launching;
    if (scene)
        node.parent = scene;
    cc_1.director.addPersistRootNode(node);
    // Built now, even when its node becomes active later (with the scene).
    scope.build();
    return scope;
}
/** Loads resources/RootLifetimeScope when there is one. */
function loadRoot() {
    if (rootPrefab || rootLoading)
        return Promise.resolve();
    const bundle = cc_1.assetManager.resources;
    if (!bundle || !bundle.getInfoWithPath(exports.ROOT_SCOPE_PATH, cc_1.Prefab))
        return Promise.resolve();
    rootLoading = true;
    return new Promise((resolve) => {
        bundle.load(exports.ROOT_SCOPE_PATH, cc_1.Prefab, (err, prefab) => {
            rootLoading = false;
            if (err || !prefab)
                console.error(`[Injector] Could not load resources/${exports.ROOT_SCOPE_PATH}:`, err);
            else
                rootPrefab = prefab;
            resolve();
            // Scopes of a running scene may be waiting (Play in Editor).
            if (cc_1.director.getScene()) {
                ensureRoot();
                retryWaiting();
            }
        });
    });
}
/** Testing and tools: forget the root scope state. */
function resetRootScope() {
    rootPrefab = null;
    rootLoading = false;
    rootScope = null;
}
if (!env_1.EDITOR_NOT_IN_PREVIEW) {
    // Ready before the first scene (game.init waits for this promise).
    if (!cc_1.game.inited)
        cc_1.game.onPostProjectInitDelegate.add(loadRoot);
    else
        loadRoot();
    cc_1.director.on(cc_1.Director.EVENT_BEFORE_SCENE_LAUNCH, (scene) => {
        launching = scene;
        try {
            if (!rootPrefab && !rootLoading)
                loadRoot();
            ensureRoot();
        }
        finally {
            launching = null;
        }
    });
}
// ------------------------------------------------- Inspector: Parent dropdown
let lastChoices = [];
/** Scope types for the Parent dropdown (editor): every LifetimeScope class but the scope's own. */
function parentChoices(scope) {
    if (!env_1.EDITOR)
        return lastChoices;
    const own = scope.constructor;
    const names = [];
    const table = cc_1.js._nameToClass || {};
    for (const name of Object.keys(table)) {
        const cls = table[name];
        if (cls !== own && typeof cls === 'function' && (cls === LifetimeScope || cls.prototype instanceof LifetimeScope))
            names.push(name);
    }
    names.sort();
    if (scope.parentReference && !names.includes(scope.parentReference))
        names.push(`${scope.parentReference} (missing)`);
    lastChoices = names;
    const list = [{ name: 'None', value: 0 }, ...names.map((name, i) => ({ name, value: i + 1 }))];
    const Attr = cc_1.CCClass.Attr;
    if (Attr === null || Attr === void 0 ? void 0 : Attr.setClassAttr) {
        Attr.setClassAttr(own, 'parentType', 'enumList', list);
        if (own !== LifetimeScope)
            Attr.setClassAttr(LifetimeScope, 'parentType', 'enumList', list);
    }
    return names;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZXRpbWUtc2NvcGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsaWZldGltZS1zY29wZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBdVZBLHdDQUlDO0FBM1ZEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9CRztBQUNILDJCQUVZO0FBQ1osZ0NBQXVEO0FBQ3ZELDZDQUE4RDtBQUc5RCxtQ0FBK0Y7QUFFL0YsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLGVBQVUsQ0FBQztBQUVqRiwrREFBK0Q7QUFDbEQsUUFBQSxlQUFlLEdBQUcsbUJBQW1CLENBQUM7QUFFbkQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRzVCLE1BQU0sVUFBVSxHQUFHLElBQUEsU0FBSSxFQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFckMsbURBQW1EO0FBQ25ELE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFpQixDQUFDO0FBQ3pDLE1BQU0sZUFBZSxHQUFnQixFQUFFLENBQUM7QUFDeEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxPQUFPLEVBQWlCLENBQUM7QUFNcEMsSUFBTSxhQUFhLHFCQUFuQixNQUFNLGFBQWMsU0FBUSxjQUFTO0lBQXJDOztRQUlILDRFQUE0RTtRQUU1RSxvQkFBZSxHQUFHLEVBQUUsQ0FBQztRQUdyQixZQUFPLEdBQUcsSUFBSSxDQUFDO1FBR2Ysb0JBQWUsR0FBVyxFQUFFLENBQUM7UUFFN0IsaUNBQWlDO1FBQ2pDLGNBQVMsR0FBcUIsSUFBSSxDQUFDO1FBQ25DLHNDQUFzQztRQUN0QyxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ1QsYUFBUSxHQUFHLEtBQUssQ0FBQztRQUNqQixlQUFVLEdBQUcsS0FBSyxDQUFDO0lBNkwvQixDQUFDO0lBM0xHLHdFQUF3RTtJQUV4RSxJQUFJLFVBQVU7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LENBQUMsSUFBSSxDQUFDO0lBQ25DLElBQUksSUFBSSxhQUFKLElBQUksdUJBQUosSUFBSSxDQUFFLFlBQVksRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkQsSUFBSSxHQUFHLEtBQUssYUFBYTtZQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2pCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExpZmV0aW1lU2NvcGUgKFZDb250YWluZXIncyBMaWZldGltZVNjb3BlKTogYSBjb21wb25lbnQgdGhhdCBidWlsZHMgYVxuICogY29udGFpbmVyIGZvciBpdHMgc2NlbmUgd2hlbiBpdCBsb2FkcywgdGhlbiBpbmplY3RzIHRoZSBub2RlcyBsaXN0ZWQgaW5cbiAqIEF1dG8gSW5qZWN0IE5vZGVzLCBiZWZvcmUgdGhlaXIgb25Mb2FkLlxuICpcbiAqICAgICBAY2NjbGFzcygnR2FtZUxpZmV0aW1lU2NvcGUnKVxuICogICAgIGV4cG9ydCBjbGFzcyBHYW1lTGlmZXRpbWVTY29wZSBleHRlbmRzIExpZmV0aW1lU2NvcGUge1xuICogICAgICAgICBAcHJvcGVydHkoR2FtZUNvbmZpZykgY29uZmlnOiBHYW1lQ29uZmlnIHwgbnVsbCA9IG51bGw7XG4gKlxuICogICAgICAgICBwcm90ZWN0ZWQgY29uZmlndXJlKGJ1aWxkZXI6IENvbnRhaW5lckJ1aWxkZXIpIHtcbiAqICAgICAgICAgICAgIGJ1aWxkZXIucmVnaXN0ZXIoQXVkaW9TZXJ2aWNlLCBMaWZldGltZS5TaW5nbGV0b24pO1xuICogICAgICAgICAgICAgYnVpbGRlci5yZWdpc3RlcihBZE1vYkFkcywgTGlmZXRpbWUuU2luZ2xldG9uKS5hcyhJQWRzKTtcbiAqICAgICAgICAgICAgIGJ1aWxkZXIucmVnaXN0ZXJJbnN0YW5jZSh0aGlzLmNvbmZpZyEpO1xuICogICAgICAgICAgICAgYnVpbGRlci5yZWdpc3RlckVudHJ5UG9pbnQoR2FtZVByZXNlbnRlcik7XG4gKiAgICAgICAgIH1cbiAqICAgICB9XG4gKlxuICogUGFyZW50OiB0aGUgc2NvcGUgb2YgdGhlIHR5cGUgY2hvc2VuIGluIFBhcmVudCAoYW55IGxvYWRlZCBzY2VuZSksIGVsc2VcbiAqIHRoZSByb290IHNjb3BlOiBhIHByZWZhYiBuYW1lZCBSb290TGlmZXRpbWVTY29wZSBpbiBhIHJlc291cmNlcyBmb2xkZXIsXG4gKiBjcmVhdGVkIGJlZm9yZSB0aGUgZmlyc3Qgc2NlbmUgYW5kIGtlcHQgYWNyb3NzIHNjZW5lcy5cbiAqL1xuaW1wb3J0IHtcbiAgICBfZGVjb3JhdG9yLCBhc3NldE1hbmFnZXIsIENDQ2xhc3MsIENvbXBvbmVudCwgZGlyZWN0b3IsIERpcmVjdG9yLCBFbnVtLCBnYW1lLCBpbnN0YW50aWF0ZSwgaXNWYWxpZCwganMsIE5vZGUsIFByZWZhYiwgU2NlbmUsXG59IGZyb20gJ2NjJztcbmltcG9ydCB7IEVESVRPUiwgRURJVE9SX05PVF9JTl9QUkVWSUVXIH0gZnJvbSAnY2MvZW52JztcbmltcG9ydCB7IENvbnRhaW5lckJ1aWxkZXIsIEluc3RhbGxlciB9IGZyb20gJy4uL2NvcmUvYnVpbGRlcic7XG5pbXBvcnQgeyBDb250YWluZXIgfSBmcm9tICcuLi9jb3JlL2NvbnRhaW5lcic7XG5pbXBvcnQgeyBDbGFzcyB9IGZyb20gJy4uL2NvcmUvdG9rZW4nO1xuaW1wb3J0IHsgZW5xdWV1ZVBhcmVudCBhcyBlbnF1ZXVlUGFyZW50Q29udGFpbmVyLCBmaW5kQ29tcG9uZW50cywgZ2l2ZW5QYXJlbnQgfSBmcm9tICcuL25vZGVzJztcblxuY29uc3QgeyBjY2NsYXNzLCBwcm9wZXJ0eSwgZXhlY3V0aW9uT3JkZXIsIG1lbnUsIGRpc2FsbG93TXVsdGlwbGUgfSA9IF9kZWNvcmF0b3I7XG5cbi8qKiBQYXRoIG9mIHRoZSByb290IHNjb3BlIHByZWZhYiBpbnNpZGUgYSByZXNvdXJjZXMgZm9sZGVyLiAqL1xuZXhwb3J0IGNvbnN0IFJPT1RfU0NPUEVfUEFUSCA9ICdSb290TGlmZXRpbWVTY29wZSc7XG5cbmNvbnN0IFdBSVQgPSBTeW1ib2woJ3dhaXQnKTtcbnR5cGUgUGFyZW50UmVzdWx0ID0gQ29udGFpbmVyIHwgbnVsbCB8IHR5cGVvZiBXQUlUO1xuXG5jb25zdCBQYXJlbnRUeXBlID0gRW51bSh7IE5vbmU6IDAgfSk7XG5cbi8qKiBTY29wZXMgd2FpdGluZyBmb3IgdGhlaXIgcGFyZW50IHRvIGJlIGJ1aWx0LiAqL1xuY29uc3Qgd2FpdGluZyA9IG5ldyBTZXQ8TGlmZXRpbWVTY29wZT4oKTtcbmNvbnN0IGV4dHJhSW5zdGFsbGVyczogSW5zdGFsbGVyW10gPSBbXTtcbmNvbnN0IHJvb3RzID0gbmV3IFdlYWtTZXQ8TGlmZXRpbWVTY29wZT4oKTtcblxuQGNjY2xhc3MoJ0xpZmV0aW1lU2NvcGUnKVxuQGV4ZWN1dGlvbk9yZGVyKC01MDAwKVxuQGRpc2FsbG93TXVsdGlwbGVcbkBtZW51KCdJbmplY3Rvci9MaWZldGltZVNjb3BlJylcbmV4cG9ydCBjbGFzcyBMaWZldGltZVNjb3BlIGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAvKiogRXZlcnkgbG9hZGVkIHNjb3BlLiAqL1xuICAgIHN0YXRpYyByZWFkb25seSBhbGw6IExpZmV0aW1lU2NvcGVbXSA9IFtdO1xuXG4gICAgLyoqIFR5cGUgbmFtZSAoY2MgY2xhc3MgbmFtZSkgb2YgdGhlIHBhcmVudCBzY29wZTsgZW1wdHk6IHRoZSByb290IHNjb3BlLiAqL1xuICAgIEBwcm9wZXJ0eSh7IHZpc2libGU6IGZhbHNlIH0pXG4gICAgcGFyZW50UmVmZXJlbmNlID0gJyc7XG5cbiAgICBAcHJvcGVydHkoeyB0b29sdGlwOiAnQnVpbGQgdGhlIGNvbnRhaW5lciB3aGVuIHRoaXMgbm9kZSBsb2Fkcy4gT2ZmOiBjYWxsIGJ1aWxkKCkgeW91cnNlbGYuJyB9KVxuICAgIGF1dG9SdW4gPSB0cnVlO1xuXG4gICAgQHByb3BlcnR5KHsgdHlwZTogW05vZGVdLCB0b29sdGlwOiAnVGhlc2Ugbm9kZXMgYW5kIHRoZWlyIGNoaWxkcmVuIGdldCB0aGVpciBAaW5qZWN0IG1lbWJlcnMgZmlsbGVkIHdoZW4gdGhlIGNvbnRhaW5lciBpcyBidWlsdCwgYmVmb3JlIHRoZWlyIG9uTG9hZC4nIH0pXG4gICAgYXV0b0luamVjdE5vZGVzOiBOb2RlW10gPSBbXTtcblxuICAgIC8qKiBUaGUgY29udGFpbmVyLCBvbmNlIGJ1aWx0LiAqL1xuICAgIGNvbnRhaW5lcjogQ29udGFpbmVyIHwgbnVsbCA9IG51bGw7XG4gICAgLyoqIFRydWUgb25jZSBkaXNwb3NlZCAoZGVzdHJveWVkKS4gKi9cbiAgICBkaXNwb3NlZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgYnVpbGRpbmcgPSBmYWxzZTtcbiAgICBwcml2YXRlIHdhcm5lZFdhaXQgPSBmYWxzZTtcblxuICAgIC8qKiBUaGUgcGFyZW50IHNob3duIGFzIGEgZHJvcGRvd24gb2YgdGhlIHNjb3BlIHR5cGVzIGluIHRoZSBwcm9qZWN0LiAqL1xuICAgIEBwcm9wZXJ0eSh7IHR5cGU6IFBhcmVudFR5cGUsIGRpc3BsYXlOYW1lOiAnUGFyZW50JywgdG9vbHRpcDogJ1RoZSBzY29wZSB0aGlzIG9uZSBpcyBhIGNoaWxkIG9mOiB0aGUgZmlyc3QgbG9hZGVkIHNjb3BlIG9mIHRoaXMgdHlwZSwgaW4gYW55IHNjZW5lLiBOb25lOiB0aGUgcm9vdCBzY29wZSAocmVzb3VyY2VzL1Jvb3RMaWZldGltZVNjb3BlKSwgaWYgdGhlcmUgaXMgb25lLicgfSlcbiAgICBnZXQgcGFyZW50VHlwZSgpOiBudW1iZXIge1xuICAgICAgICBjb25zdCByZWYgPSB0aGlzLnBhcmVudFJlZmVyZW5jZTtcbiAgICAgICAgY29uc3QgaSA9IHJlZiA/IHBhcmVudENob2ljZXModGhpcykuZmluZEluZGV4KChuKSA9PiBuID09PSByZWYgfHwgbiA9PT0gYCR7cmVmfSAobWlzc2luZylgKSA6IChwYXJlbnRDaG9pY2VzKHRoaXMpLCAtMSk7XG4gICAgICAgIHJldHVybiBpIDwgMCA/IDAgOiBpICsgMTtcbiAgICB9XG5cbiAgICBzZXQgcGFyZW50VHlwZSh2OiBudW1iZXIpIHtcbiAgICAgICAgY29uc3QgbmFtZXMgPSBwYXJlbnRDaG9pY2VzKHRoaXMpO1xuICAgICAgICB0aGlzLnBhcmVudFJlZmVyZW5jZSA9IHYgPiAwICYmIHYgPD0gbmFtZXMubGVuZ3RoID8gbmFtZXNbdiAtIDFdLnJlcGxhY2UoLyBcXChtaXNzaW5nXFwpJC8sICcnKSA6ICcnO1xuICAgIH1cblxuICAgIC8qKiBUcnVlIGZvciB0aGUgc2NvcGUgbWFkZSBmcm9tIHJlc291cmNlcy9Sb290TGlmZXRpbWVTY29wZS4gKi9cbiAgICBnZXQgaXNSb290KCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gcm9vdHMuaGFzKHRoaXMpO1xuICAgIH1cblxuICAgIC8qKiBSZWdpc3RyYXRpb25zIG9mIHRoaXMgc2NvcGUgKFZDb250YWluZXIncyBDb25maWd1cmUpLiAqL1xuICAgIHByb3RlY3RlZCBjb25maWd1cmUoX2J1aWxkZXI6IENvbnRhaW5lckJ1aWxkZXIpOiB2b2lkIHt9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHN0YXRpY1xuXG4gICAgLyoqIFRoZSBmaXJzdCBsb2FkZWQgc2NvcGUgb2YgYSB0eXBlIChjbGFzcyBvciBjYyBjbGFzcyBuYW1lKS4gKi9cbiAgICBzdGF0aWMgZmluZDxUIGV4dGVuZHMgTGlmZXRpbWVTY29wZT4odHlwZT86IENsYXNzPFQ+IHwgc3RyaW5nKTogVCB8IG51bGwge1xuICAgICAgICByZXR1cm4gKGZpbmRTY29wZSh0eXBlIHx8IExpZmV0aW1lU2NvcGUsIG51bGwpIGFzIFQpIHx8IG51bGw7XG4gICAgfVxuXG4gICAgLyoqIEV4dHJhIHJlZ2lzdHJhdGlvbnMgZm9yIGV2ZXJ5IHNjb3BlIGJ1aWx0IHVudGlsIGRpc3Bvc2UoKSAoVkNvbnRhaW5lcidzIEVucXVldWUpLCBlLmcuIGRhdGEgZm9yIHRoZSBuZXh0IHNjZW5lLiAqL1xuICAgIHN0YXRpYyBlbnF1ZXVlKGluc3RhbGxlcjogSW5zdGFsbGVyKTogeyBkaXNwb3NlKCk6IHZvaWQgfSB7XG4gICAgICAgIGV4dHJhSW5zdGFsbGVycy5wdXNoKGluc3RhbGxlcik7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBkaXNwb3NlKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGkgPSBleHRyYUluc3RhbGxlcnMuaW5kZXhPZihpbnN0YWxsZXIpO1xuICAgICAgICAgICAgICAgIGlmIChpID49IDApIGV4dHJhSW5zdGFsbGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKiBTY29wZXMgYnVpbHQgdW50aWwgZGlzcG9zZSgpIGJlY29tZSBjaGlsZHJlbiBvZiBgcGFyZW50YCAoVkNvbnRhaW5lcidzIEVucXVldWVQYXJlbnQpLiAqL1xuICAgIHN0YXRpYyBlbnF1ZXVlUGFyZW50KHBhcmVudDogTGlmZXRpbWVTY29wZSB8IENvbnRhaW5lcik6IHsgZGlzcG9zZSgpOiB2b2lkIH0ge1xuICAgICAgICBjb25zdCBjID0gcGFyZW50IGluc3RhbmNlb2YgTGlmZXRpbWVTY29wZSA/IHBhcmVudC5jb250YWluZXIgOiBwYXJlbnQ7XG4gICAgICAgIGlmICghYykgdGhyb3cgbmV3IEVycm9yKCdbSW5qZWN0b3JdIGVucXVldWVQYXJlbnQoKTogdGhlIHBhcmVudCBzY29wZSBpcyBub3QgYnVpbHQgeWV0LicpO1xuICAgICAgICByZXR1cm4gZW5xdWV1ZVBhcmVudENvbnRhaW5lcihjKTtcbiAgICB9XG5cbiAgICAvKiogVGhlIHJvb3Qgc2NvcGUgKHJlc291cmNlcy9Sb290TGlmZXRpbWVTY29wZSksIG9yIG51bGwuICovXG4gICAgc3RhdGljIGdldCByb290KCk6IExpZmV0aW1lU2NvcGUgfCBudWxsIHtcbiAgICAgICAgY29uc3QgciA9IGVuc3VyZVJvb3QoKTtcbiAgICAgICAgcmV0dXJuIHIgPT09IFdBSVQgPyBudWxsIDogcm9vdFNjb3BlO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gbGlmZWN5Y2xlXG5cbiAgICBvbkxvYWQoKSB7XG4gICAgICAgIGlmICghTGlmZXRpbWVTY29wZS5hbGwuaW5jbHVkZXModGhpcykpIExpZmV0aW1lU2NvcGUuYWxsLnB1c2godGhpcyk7XG4gICAgICAgIGlmICh0aGlzLmF1dG9SdW4pIHRoaXMuYnVpbGQoKTtcbiAgICB9XG5cbiAgICBvbkRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJ1aWxkcyB0aGUgY29udGFpbmVyIChvbmNlKS4gUmV0dXJucyBmYWxzZSB3aGlsZSB0aGUgcGFyZW50IGlzbid0XG4gICAgICogYXZhaWxhYmxlIHlldCAoaXQgYnVpbGRzIGFzIHNvb24gYXMgaXQgaXMpIG9yIHdoZW4gdGhlIGJ1aWxkIGZhaWxlZC5cbiAgICAgKi9cbiAgICBidWlsZCgpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuY29udGFpbmVyKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKHRoaXMuYnVpbGRpbmcgfHwgdGhpcy5kaXNwb3NlZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoIUxpZmV0aW1lU2NvcGUuYWxsLmluY2x1ZGVzKHRoaXMpKSBMaWZldGltZVNjb3BlLmFsbC5wdXNoKHRoaXMpO1xuICAgICAgICB0aGlzLmJ1aWxkaW5nID0gdHJ1ZTtcbiAgICAgICAgbGV0IHBhcmVudDogUGFyZW50UmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcGFyZW50ID0gdGhpcy5maW5kUGFyZW50KCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLmJ1aWxkaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBhcmVudCA9PT0gV0FJVCkge1xuICAgICAgICAgICAgd2FpdGluZy5hZGQodGhpcyk7XG4gICAgICAgICAgICBpZiAoIXRoaXMud2FybmVkV2FpdCkge1xuICAgICAgICAgICAgICAgIHRoaXMud2FybmVkV2FpdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBbSW5qZWN0b3JdICR7dGhpcy5zY29wZU5hbWV9IHdhaXRzIGZvciBpdHMgcGFyZW50ICgke3RoaXMucGFyZW50UmVmZXJlbmNlIHx8IFJPT1RfU0NPUEVfUEFUSH0pOyBpdCBpcyBidWlsdCBhcyBzb29uIGFzIHRoZSBwYXJlbnQgaXMuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgd2FpdGluZy5kZWxldGUodGhpcyk7XG4gICAgICAgIHRoaXMuYnVpbGRpbmcgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYiA9IG5ldyBDb250YWluZXJCdWlsZGVyKHBhcmVudCwgdGhpcy5zY29wZU5hbWUpO1xuICAgICAgICAgICAgYi5zY29wZSA9IHRoaXM7XG4gICAgICAgICAgICBiLnJlZ2lzdGVySW5zdGFuY2UodGhpcykuYXMoTGlmZXRpbWVTY29wZSkuYXNTZWxmKCk7XG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNSb290KSBmb3IgKGNvbnN0IGZuIG9mIGV4dHJhSW5zdGFsbGVycy5zbGljZSgpKSBmbihiKTtcbiAgICAgICAgICAgIHRoaXMuY29uZmlndXJlKGIpO1xuICAgICAgICAgICAgdGhpcy5jb250YWluZXIgPSBiLmJ1aWxkKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IChlIGFzIEVycm9yKT8ubWVzc2FnZSB8fCAnJztcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IobXNnLnN0YXJ0c1dpdGgoJ1tJbmplY3Rvcl0nKSA/IG1zZyA6IGUpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5idWlsZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgbiBvZiB0aGlzLmF1dG9JbmplY3ROb2Rlcykge1xuICAgICAgICAgICAgaWYgKCFuIHx8ICFpc1ZhbGlkKG4sIHRydWUpKSBjb250aW51ZTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb250YWluZXIuaW5qZWN0Tm9kZShuKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKChlIGFzIEVycm9yKT8ubWVzc2FnZSB8fCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXRyeVdhaXRpbmcoKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqIERpc3Bvc2VzIHRoZSBjb250YWluZXIgKGFuZCBjaGlsZCBzY29wZXMpLiBDYWxsZWQgd2hlbiB0aGUgbm9kZSBpcyBkZXN0cm95ZWQuICovXG4gICAgZGlzcG9zZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybjtcbiAgICAgICAgdGhpcy5kaXNwb3NlZCA9IHRydWU7XG4gICAgICAgIHdhaXRpbmcuZGVsZXRlKHRoaXMpO1xuICAgICAgICBjb25zdCBpID0gTGlmZXRpbWVTY29wZS5hbGwuaW5kZXhPZih0aGlzKTtcbiAgICAgICAgaWYgKGkgPj0gMCkgTGlmZXRpbWVTY29wZS5hbGwuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmNvbnRhaW5lcj8uZGlzcG9zZSgpO1xuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IG51bGw7XG4gICAgICAgIGlmIChyb290U2NvcGUgPT09IHRoaXMpIHJvb3RTY29wZSA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqIEEgY2hpbGQgc2NvcGUgb24gYSBuZXcgbm9kZSB1bmRlciB0aGlzIG9uZSAoVkNvbnRhaW5lcidzIENyZWF0ZUNoaWxkKS4gKi9cbiAgICBjcmVhdGVDaGlsZChpbnN0YWxsZXI/OiBJbnN0YWxsZXIsIG5hbWUgPSAnTGlmZXRpbWVTY29wZSAoQ2hpbGQpJyk6IExpZmV0aW1lU2NvcGUge1xuICAgICAgICBpZiAoIXRoaXMuY29udGFpbmVyKSB0aHJvdyBuZXcgRXJyb3IoYFtJbmplY3Rvcl0gJHt0aGlzLnNjb3BlTmFtZX0gaXMgbm90IGJ1aWx0IHlldC5gKTtcbiAgICAgICAgY29uc3Qgbm9kZSA9IG5ldyBOb2RlKG5hbWUpO1xuICAgICAgICBjb25zdCBzY29wZSA9IG5vZGUuYWRkQ29tcG9uZW50KExpZmV0aW1lU2NvcGUpO1xuICAgICAgICBzY29wZS5hdXRvUnVuID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IGV4dHJhID0gaW5zdGFsbGVyID8gTGlmZXRpbWVTY29wZS5lbnF1ZXVlKGluc3RhbGxlcikgOiBudWxsO1xuICAgICAgICBjb25zdCBoID0gZW5xdWV1ZVBhcmVudENvbnRhaW5lcih0aGlzLmNvbnRhaW5lcik7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBub2RlLnBhcmVudCA9IHRoaXMubm9kZTtcbiAgICAgICAgICAgIHNjb3BlLmJ1aWxkKCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBoLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIGV4dHJhPy5kaXNwb3NlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIC8qKiBJbnN0YW50aWF0ZXMgYSBwcmVmYWIgd2hvc2Ugcm9vdCBoYXMgYSBMaWZldGltZVNjb3BlLCBhcyBhIGNoaWxkIHNjb3BlIG9mIHRoaXMgb25lLiAqL1xuICAgIGNyZWF0ZUNoaWxkRnJvbVByZWZhYjxUIGV4dGVuZHMgTGlmZXRpbWVTY29wZT4ocHJlZmFiOiBQcmVmYWIsIGluc3RhbGxlcj86IEluc3RhbGxlciwgcGFyZW50OiBOb2RlID0gdGhpcy5ub2RlKTogVCB7XG4gICAgICAgIGlmICghdGhpcy5jb250YWluZXIpIHRocm93IG5ldyBFcnJvcihgW0luamVjdG9yXSAke3RoaXMuc2NvcGVOYW1lfSBpcyBub3QgYnVpbHQgeWV0LmApO1xuICAgICAgICBjb25zdCBleHRyYSA9IGluc3RhbGxlciA/IExpZmV0aW1lU2NvcGUuZW5xdWV1ZShpbnN0YWxsZXIpIDogbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLmNvbnRhaW5lci5pbnN0YW50aWF0ZShwcmVmYWIsIHBhcmVudCk7XG4gICAgICAgICAgICBjb25zdCBzY29wZSA9IG5vZGUuZ2V0Q29tcG9uZW50KExpZmV0aW1lU2NvcGUpIGFzIFQgfCBudWxsO1xuICAgICAgICAgICAgaWYgKCFzY29wZSkgdGhyb3cgbmV3IEVycm9yKGBbSW5qZWN0b3JdIFRoZSBwcmVmYWIgJHtwcmVmYWIubmFtZX0gaGFzIG5vIExpZmV0aW1lU2NvcGUgb24gaXRzIHJvb3QuYCk7XG4gICAgICAgICAgICBpZiAoIXNjb3BlLmNvbnRhaW5lcikgc2NvcGUuYnVpbGQoKTtcbiAgICAgICAgICAgIHJldHVybiBzY29wZTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGV4dHJhPy5kaXNwb3NlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogU2hvcnRjdXQgZm9yIGNvbnRhaW5lci5pbnN0YW50aWF0ZSgpLiAqL1xuICAgIGluc3RhbnRpYXRlKG9yaWdpbmFsOiBQcmVmYWIgfCBOb2RlLCBwYXJlbnQ/OiBOb2RlIHwgbnVsbCk6IE5vZGUge1xuICAgICAgICBpZiAoIXRoaXMuY29udGFpbmVyKSB0aHJvdyBuZXcgRXJyb3IoYFtJbmplY3Rvcl0gJHt0aGlzLnNjb3BlTmFtZX0gaXMgbm90IGJ1aWx0IHlldC5gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGFpbmVyLmluc3RhbnRpYXRlKG9yaWdpbmFsLCBwYXJlbnQpO1xuICAgIH1cblxuICAgIC8qKiBUaGUgc2NvcGUncyBuYW1lIGluIG1lc3NhZ2VzIGFuZCB0aGUgRGlhZ25vc3RpY3Mgd2luZG93LiAqL1xuICAgIGdldCBzY29wZU5hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgdHlwZSA9IGpzLmdldENsYXNzTmFtZSh0aGlzLmNvbnN0cnVjdG9yKSB8fCAnTGlmZXRpbWVTY29wZSc7XG4gICAgICAgIHJldHVybiB0eXBlID09PSAnTGlmZXRpbWVTY29wZScgPyBgTGlmZXRpbWVTY29wZSAoJHt0aGlzLm5vZGU/Lm5hbWUgfHwgJz8nfSlgIDogdHlwZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGZpbmRQYXJlbnQoKTogUGFyZW50UmVzdWx0IHtcbiAgICAgICAgaWYgKHRoaXMuaXNSb290KSByZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgZ2l2ZW4gPSBnaXZlblBhcmVudCh0aGlzLm5vZGUpO1xuICAgICAgICBpZiAoZ2l2ZW4pIHJldHVybiBnaXZlbjtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50UmVmZXJlbmNlKSB7XG4gICAgICAgICAgICBjb25zdCBzID0gZmluZFNjb3BlKHRoaXMucGFyZW50UmVmZXJlbmNlLCB0aGlzKTtcbiAgICAgICAgICAgIGlmICghcyB8fCAhcy5ub2RlLmFjdGl2ZUluSGllcmFyY2h5ICYmICFzLmNvbnRhaW5lcikgcmV0dXJuIFdBSVQ7XG4gICAgICAgICAgICBpZiAoIXMuY29udGFpbmVyICYmICFzLmJ1aWxkKCkpIHJldHVybiBXQUlUO1xuICAgICAgICAgICAgcmV0dXJuIHMuY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvb3QgPSBlbnN1cmVSb290KCk7XG4gICAgICAgIGlmIChyb290ID09PSBXQUlUKSByZXR1cm4gV0FJVDtcbiAgICAgICAgaWYgKCFyb290IHx8IHJvb3QgPT09IHRoaXMpIHJldHVybiBudWxsO1xuICAgICAgICBpZiAoIXJvb3QuY29udGFpbmVyICYmICFyb290LmJ1aWxkKCkpIHJldHVybiByb290LmRpc3Bvc2VkID8gbnVsbCA6IFdBSVQ7XG4gICAgICAgIHJldHVybiByb290LmNvbnRhaW5lcjtcbiAgICB9XG59XG5cbi8vIE1hcmtzIHNjb3BlIGNvbXBvbmVudHMgZm9yIG5vZGVzLnRzIChubyBjaXJjdWxhciBpbXBvcnQpLlxuKExpZmV0aW1lU2NvcGUucHJvdG90eXBlIGFzIGFueSkuX19saWZldGltZVNjb3BlID0gdHJ1ZTtcblxuZnVuY3Rpb24gcmV0cnlXYWl0aW5nKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgcyBvZiBbLi4ud2FpdGluZ10pIHtcbiAgICAgICAgaWYgKCF3YWl0aW5nLmhhcyhzKSkgY29udGludWU7XG4gICAgICAgIGlmICghaXNWYWxpZChzLCB0cnVlKSB8fCBzLmRpc3Bvc2VkKSB7XG4gICAgICAgICAgICB3YWl0aW5nLmRlbGV0ZShzKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHMuYnVpbGQoKTtcbiAgICB9XG59XG5cbi8qKiBBIGxvYWRlZCAob3Igbm90IHlldCBsb2FkZWQpIHNjb3BlIG9mIGEgdHlwZSwgYnVpbHQgb25lcyBmaXJzdC4gKi9cbmZ1bmN0aW9uIGZpbmRTY29wZSh0eXBlOiBGdW5jdGlvbiB8IHN0cmluZywgZXhjbHVkZTogTGlmZXRpbWVTY29wZSB8IG51bGwpOiBMaWZldGltZVNjb3BlIHwgbnVsbCB7XG4gICAgY29uc3QgY2xzOiBhbnkgPSB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyBqcy5nZXRDbGFzc0J5TmFtZSh0eXBlKSA6IHR5cGU7XG4gICAgY29uc3QgbWF0Y2hlcyA9IChzOiBMaWZldGltZVNjb3BlKSA9PlxuICAgICAgICBzICE9PSBleGNsdWRlICYmICFzLmRpc3Bvc2VkICYmIGlzVmFsaWQocywgdHJ1ZSkgJiYgKGNscyA/IHMgaW5zdGFuY2VvZiBjbHMgOiBqcy5nZXRDbGFzc05hbWUocy5jb25zdHJ1Y3RvcikgPT09IHR5cGUpO1xuICAgIGNvbnN0IGxvYWRlZCA9IExpZmV0aW1lU2NvcGUuYWxsLmZpbHRlcihtYXRjaGVzKTtcbiAgICBjb25zdCBidWlsdCA9IGxvYWRlZC5maW5kKChzKSA9PiAhIXMuY29udGFpbmVyKTtcbiAgICBpZiAoYnVpbHQgfHwgbG9hZGVkLmxlbmd0aCkgcmV0dXJuIGJ1aWx0IHx8IGxvYWRlZFswXTtcbiAgICAvLyBTY29wZXMgb2YgdGhlIHNjZW5lIHRoYXQgaGF2ZW4ndCBsb2FkZWQgeWV0ICh0aGVpciBvbkxvYWQgY29tZXMgbGF0ZXIgaW4gdGhpcyBmcmFtZSkuXG4gICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgIGlmICghc2NlbmUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiAoZmluZENvbXBvbmVudHMoc2NlbmUsIExpZmV0aW1lU2NvcGUpIGFzIExpZmV0aW1lU2NvcGVbXSkuZmluZChtYXRjaGVzKSB8fCBudWxsO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gcm9vdCBzY29wZVxuXG5sZXQgcm9vdFByZWZhYjogUHJlZmFiIHwgbnVsbCA9IG51bGw7XG5sZXQgcm9vdExvYWRpbmcgPSBmYWxzZTtcbmxldCByb290U2NvcGU6IExpZmV0aW1lU2NvcGUgfCBudWxsID0gbnVsbDtcbi8qKiBUaGUgc2NlbmUgYmVpbmcgbGF1bmNoZWQgKEJFRk9SRV9TQ0VORV9MQVVOQ0ggY29tZXMgYmVmb3JlIGRpcmVjdG9yLmdldFNjZW5lKCkgcmV0dXJucyBpdCkuICovXG5sZXQgbGF1bmNoaW5nOiBTY2VuZSB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBlbnN1cmVSb290KCk6IExpZmV0aW1lU2NvcGUgfCBudWxsIHwgdHlwZW9mIFdBSVQge1xuICAgIGlmIChyb290U2NvcGUgJiYgIXJvb3RTY29wZS5kaXNwb3NlZCAmJiBpc1ZhbGlkKHJvb3RTY29wZSwgdHJ1ZSkpIHJldHVybiByb290U2NvcGU7XG4gICAgcm9vdFNjb3BlID0gbnVsbDtcbiAgICBpZiAocm9vdFByZWZhYiAmJiBpc1ZhbGlkKHJvb3RQcmVmYWIpKSByZXR1cm4gY3JlYXRlUm9vdChyb290UHJlZmFiKTtcbiAgICByZXR1cm4gcm9vdExvYWRpbmcgPyBXQUlUIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUm9vdChwcmVmYWI6IFByZWZhYik6IExpZmV0aW1lU2NvcGUgfCBudWxsIHtcbiAgICBjb25zdCBub2RlID0gaW5zdGFudGlhdGUocHJlZmFiKSBhcyBOb2RlO1xuICAgIGNvbnN0IHNjb3BlID0gbm9kZS5nZXRDb21wb25lbnQoTGlmZXRpbWVTY29wZSk7XG4gICAgaWYgKCFzY29wZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBbSW5qZWN0b3JdIHJlc291cmNlcy8ke1JPT1RfU0NPUEVfUEFUSH0gaGFzIG5vIExpZmV0aW1lU2NvcGUgb24gaXRzIHJvb3Qgbm9kZS5gKTtcbiAgICAgICAgcm9vdFByZWZhYiA9IG51bGw7XG4gICAgICAgIG5vZGUuZGVzdHJveSgpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcm9vdHMuYWRkKHNjb3BlKTtcbiAgICByb290U2NvcGUgPSBzY29wZTtcbiAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCkgfHwgbGF1bmNoaW5nO1xuICAgIGlmIChzY2VuZSkgbm9kZS5wYXJlbnQgPSBzY2VuZTtcbiAgICBkaXJlY3Rvci5hZGRQZXJzaXN0Um9vdE5vZGUobm9kZSk7XG4gICAgLy8gQnVpbHQgbm93LCBldmVuIHdoZW4gaXRzIG5vZGUgYmVjb21lcyBhY3RpdmUgbGF0ZXIgKHdpdGggdGhlIHNjZW5lKS5cbiAgICBzY29wZS5idWlsZCgpO1xuICAgIHJldHVybiBzY29wZTtcbn1cblxuLyoqIExvYWRzIHJlc291cmNlcy9Sb290TGlmZXRpbWVTY29wZSB3aGVuIHRoZXJlIGlzIG9uZS4gKi9cbmZ1bmN0aW9uIGxvYWRSb290KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChyb290UHJlZmFiIHx8IHJvb3RMb2FkaW5nKSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgY29uc3QgYnVuZGxlID0gYXNzZXRNYW5hZ2VyLnJlc291cmNlcztcbiAgICBpZiAoIWJ1bmRsZSB8fCAhYnVuZGxlLmdldEluZm9XaXRoUGF0aChST09UX1NDT1BFX1BBVEgsIFByZWZhYikpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICByb290TG9hZGluZyA9IHRydWU7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGJ1bmRsZS5sb2FkKFJPT1RfU0NPUEVfUEFUSCwgUHJlZmFiLCAoZXJyOiBFcnJvciB8IG51bGwsIHByZWZhYjogUHJlZmFiKSA9PiB7XG4gICAgICAgICAgICByb290TG9hZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGVyciB8fCAhcHJlZmFiKSBjb25zb2xlLmVycm9yKGBbSW5qZWN0b3JdIENvdWxkIG5vdCBsb2FkIHJlc291cmNlcy8ke1JPT1RfU0NPUEVfUEFUSH06YCwgZXJyKTtcbiAgICAgICAgICAgIGVsc2Ugcm9vdFByZWZhYiA9IHByZWZhYjtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIC8vIFNjb3BlcyBvZiBhIHJ1bm5pbmcgc2NlbmUgbWF5IGJlIHdhaXRpbmcgKFBsYXkgaW4gRWRpdG9yKS5cbiAgICAgICAgICAgIGlmIChkaXJlY3Rvci5nZXRTY2VuZSgpKSB7XG4gICAgICAgICAgICAgICAgZW5zdXJlUm9vdCgpO1xuICAgICAgICAgICAgICAgIHJldHJ5V2FpdGluZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuLyoqIFRlc3RpbmcgYW5kIHRvb2xzOiBmb3JnZXQgdGhlIHJvb3Qgc2NvcGUgc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRSb290U2NvcGUoKTogdm9pZCB7XG4gICAgcm9vdFByZWZhYiA9IG51bGw7XG4gICAgcm9vdExvYWRpbmcgPSBmYWxzZTtcbiAgICByb290U2NvcGUgPSBudWxsO1xufVxuXG5pZiAoIUVESVRPUl9OT1RfSU5fUFJFVklFVykge1xuICAgIC8vIFJlYWR5IGJlZm9yZSB0aGUgZmlyc3Qgc2NlbmUgKGdhbWUuaW5pdCB3YWl0cyBmb3IgdGhpcyBwcm9taXNlKS5cbiAgICBpZiAoIWdhbWUuaW5pdGVkKSBnYW1lLm9uUG9zdFByb2plY3RJbml0RGVsZWdhdGUuYWRkKGxvYWRSb290KTtcbiAgICBlbHNlIGxvYWRSb290KCk7XG4gICAgZGlyZWN0b3Iub24oRGlyZWN0b3IuRVZFTlRfQkVGT1JFX1NDRU5FX0xBVU5DSCwgKHNjZW5lOiBTY2VuZSkgPT4ge1xuICAgICAgICBsYXVuY2hpbmcgPSBzY2VuZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghcm9vdFByZWZhYiAmJiAhcm9vdExvYWRpbmcpIGxvYWRSb290KCk7XG4gICAgICAgICAgICBlbnN1cmVSb290KCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBsYXVuY2hpbmcgPSBudWxsO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gSW5zcGVjdG9yOiBQYXJlbnQgZHJvcGRvd25cblxubGV0IGxhc3RDaG9pY2VzOiBzdHJpbmdbXSA9IFtdO1xuXG4vKiogU2NvcGUgdHlwZXMgZm9yIHRoZSBQYXJlbnQgZHJvcGRvd24gKGVkaXRvcik6IGV2ZXJ5IExpZmV0aW1lU2NvcGUgY2xhc3MgYnV0IHRoZSBzY29wZSdzIG93bi4gKi9cbmZ1bmN0aW9uIHBhcmVudENob2ljZXMoc2NvcGU6IExpZmV0aW1lU2NvcGUpOiBzdHJpbmdbXSB7XG4gICAgaWYgKCFFRElUT1IpIHJldHVybiBsYXN0Q2hvaWNlcztcbiAgICBjb25zdCBvd24gPSBzY29wZS5jb25zdHJ1Y3RvcjtcbiAgICBjb25zdCBuYW1lczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCB0YWJsZSA9IChqcyBhcyBhbnkpLl9uYW1lVG9DbGFzcyB8fCB7fTtcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXModGFibGUpKSB7XG4gICAgICAgIGNvbnN0IGNscyA9IHRhYmxlW25hbWVdO1xuICAgICAgICBpZiAoY2xzICE9PSBvd24gJiYgdHlwZW9mIGNscyA9PT0gJ2Z1bmN0aW9uJyAmJiAoY2xzID09PSBMaWZldGltZVNjb3BlIHx8IGNscy5wcm90b3R5cGUgaW5zdGFuY2VvZiBMaWZldGltZVNjb3BlKSkgbmFtZXMucHVzaChuYW1lKTtcbiAgICB9XG4gICAgbmFtZXMuc29ydCgpO1xuICAgIGlmIChzY29wZS5wYXJlbnRSZWZlcmVuY2UgJiYgIW5hbWVzLmluY2x1ZGVzKHNjb3BlLnBhcmVudFJlZmVyZW5jZSkpIG5hbWVzLnB1c2goYCR7c2NvcGUucGFyZW50UmVmZXJlbmNlfSAobWlzc2luZylgKTtcbiAgICBsYXN0Q2hvaWNlcyA9IG5hbWVzO1xuICAgIGNvbnN0IGxpc3QgPSBbeyBuYW1lOiAnTm9uZScsIHZhbHVlOiAwIH0sIC4uLm5hbWVzLm1hcCgobmFtZSwgaSkgPT4gKHsgbmFtZSwgdmFsdWU6IGkgKyAxIH0pKV07XG4gICAgY29uc3QgQXR0ciA9IChDQ0NsYXNzIGFzIGFueSkuQXR0cjtcbiAgICBpZiAoQXR0cj8uc2V0Q2xhc3NBdHRyKSB7XG4gICAgICAgIEF0dHIuc2V0Q2xhc3NBdHRyKG93biwgJ3BhcmVudFR5cGUnLCAnZW51bUxpc3QnLCBsaXN0KTtcbiAgICAgICAgaWYgKG93biAhPT0gTGlmZXRpbWVTY29wZSkgQXR0ci5zZXRDbGFzc0F0dHIoTGlmZXRpbWVTY29wZSwgJ3BhcmVudFR5cGUnLCAnZW51bUxpc3QnLCBsaXN0KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzO1xufVxuIl19