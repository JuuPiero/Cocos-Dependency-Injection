# Injector: dependency injection for Cocos Creator 3.8

A dependency injection container in the style of **VContainer**, for Cocos Creator 3.8.6+. It is small, fast and scene-aware.

- **Registrations** in code: classes, instances, factories, components; Singleton, Scoped and Transient lifetimes.
- **`@inject`** on constructors, fields and methods.
- **`LifetimeScope` components** with parent and child scopes. A scope injects the scene's components **before their `onLoad`**.
- **A root scope** that lives across scenes: a prefab in `resources`.
- **Entry points**: plain classes with `start` / `tick` / `lateTick` / `dispose`, without being components.
- **Checks at build time**: every missing registration and dependency cycle is listed at once.
- **An Injector Diagnostics window** that looks into the running game: Play in Editor, browser previews, and phones on your network.

| VContainer | Here |
|---|---|
| `[Inject]` (constructor, field, property, method) | `@inject(A, B)` on the class, a field or a method |
| `IContainerBuilder.Register<T>(Lifetime)` | `builder.register(T, Lifetime.Singleton)` |
| `.As<I>()`, `.AsSelf()`, `.WithParameter()` | `.as(I)`, `.asSelf()`, `.withParameter(token, value)` |
| `RegisterInstance`, `Register<T>(resolver => …)` | `registerInstance(obj)`, `registerFactory(T, (r) => …, lifetime)` |
| `RegisterEntryPoint<T>()` | `registerEntryPoint(T)` |
| `RegisterComponent`, `RegisterComponentInHierarchy`, `RegisterComponentOnNewGameObject`, `RegisterComponentInNewPrefab` | `registerComponent`, `registerComponentInHierarchy`, `registerComponentOnNewNode`, `registerComponentInNewPrefab` |
| `RegisterBuildCallback`, `RegisterEntryPointExceptionHandler` | same names, camelCase |
| `IObjectResolver.Resolve / Inject / Instantiate / CreateScope` | `container.resolve / inject / instantiate / createScope` |
| `IEnumerable<T>` / optional injection | `all(T)` / `optional(T)` |
| `LifetimeScope`, `Configure`, Parent, Auto Run, Auto Inject Game Objects | `LifetimeScope`, `configure()`, **Parent**, **Auto Run**, **Auto Inject Nodes** |
| `LifetimeScope.Enqueue`, `EnqueueParent`, `CreateChild`, `CreateChildFromPrefab` | `LifetimeScope.enqueue`, `enqueueParent`, `createChild`, `createChildFromPrefab` |
| VContainerSettings → Root LifetimeScope | a prefab named `RootLifetimeScope` in a `resources` folder |
| `IInitializable`, `IStartable`, `IAsyncStartable`, `ITickable`, `ILateTickable`, `IFixedTickable`, `Post*`, `IDisposable` | `Initializable`, `Startable`, `AsyncStartable`, `Tickable`, `LateTickable`, `FixedTickable`, `Post*`, `Disposable` |
| VContainer Diagnostics window | **Panel → Injector Diagnostics** |

## Contents

- [Quick start](#quick-start)
- [Tokens: classes, abstract classes, `token()`](#tokens-classes-abstract-classes-token)
- [`@inject`](#inject)
- [Registering](#registering)
- [Lifetimes and scopes](#lifetimes-and-scopes)
- [LifetimeScope](#lifetimescope)
- [The root scope](#the-root-scope)
- [Prefabs, runtime objects and child scopes](#prefabs-runtime-objects-and-child-scopes)
- [Entry points](#entry-points)
- [Resolving by hand](#resolving-by-hand)
- [Errors](#errors)
- [Injector Diagnostics](#injector-diagnostics)
- [With ScriptableObject and ECS](#with-scriptableobject-and-ecs)
- [Cocos rules to know](#cocos-rules-to-know)
- [Development](#development)

## Quick start

Import everything from `db://injector/index`. The extension mounts its runtime as the `db://injector` asset folder.

**1. Services** are plain classes. TypeScript interfaces don't exist at runtime, so use an **abstract class** as the interface:

```ts
// Services.ts
import { inject } from 'db://injector/index';

export abstract class IAds {
    abstract showInterstitial(): Promise<void>;
}

export class EditorAds extends IAds {
    async showInterstitial() { console.log('[Ads] (editor) interstitial'); }
}

export class ScoreService {
    score = 0;
}

@inject(IAds, ScoreService)          // constructor parameters, in order
export class GamePresenter {
    constructor(private ads: IAds, private score: ScoreService) {}

    start() { console.log('game started'); }
    tick(dt: number) { this.score.score += dt; }
}
```

**2. A scope** registers them. Each component goes in its own file, because Cocos allows one Component class per script.

```ts
// GameLifetimeScope.ts
import { _decorator } from 'cc';
import { ContainerBuilder, Lifetime, LifetimeScope } from 'db://injector/index';
import { EditorAds, GamePresenter, IAds, ScoreService } from './Services';
const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: ContainerBuilder) {
        builder.register(EditorAds, Lifetime.Singleton).as(IAds);
        builder.register(ScoreService, Lifetime.Singleton);
        builder.registerEntryPoint(GamePresenter);
    }
}
```

**3. Components** of the scene ask for what they need:

```ts
// ScoreLabel.ts
import { _decorator, Component, Label } from 'cc';
import { inject } from 'db://injector/index';
import { ScoreService } from './Services';
const { ccclass } = _decorator;

@ccclass('ScoreLabel')
export class ScoreLabel extends Component {
    @inject(ScoreService) score!: ScoreService;

    onLoad() {
        // Already injected here.
    }

    update() {
        this.getComponent(Label)!.string = `Score: ${Math.floor(this.score.score)}`;
    }
}
```

**4. In the scene**:

1. Add **Injector → LifetimeScope**, or your subclass, to a node.
2. Drag the nodes to inject, for example the Canvas, into **Auto Inject Nodes**.
3. Press Play.
4. Open **Panel → Injector Diagnostics** to see the scopes, registrations and instances.

The DI project has these files in `assets/samples`.

> **Tip:** VS Code imports the project's `db://` paths when `.vscode/settings.json` has
> `"typescript.preferences.importModuleSpecifier": "non-relative"`.

## Tokens: classes, abstract classes, `token()`

A dependency is looked up by a **token**:

- **A class**, concrete or abstract, is its own token. `@inject(AudioService)`
- **An abstract class** serves as an interface you can swap: `builder.register(AdMobAds, Lifetime.Singleton).as(IAds)` in builds, and `EditorAds` in the editor.
- **`token<T>(name)`** is for values without a class: numbers, strings, functions, configuration objects, or a real TS interface.

```ts
export const LevelNumber = token<number>('LevelNumber');
export const SpawnEnemy = token<(hp: number) => Enemy>('SpawnEnemy');

builder.registerInstance(3).as(LevelNumber);

@inject(LevelNumber)
class LevelLoader {
    constructor(readonly level: number) {}
}
```

## `@inject`

| Where | Meaning |
|---|---|
| on a **class** | constructor parameters, in order: `@inject(A, B) class X { constructor(a: A, b: B) {} }` |
| on a **field** | one token: `@inject(A) a!: A;` |
| on a **method** | its parameters; it is called after the fields: `@inject(A, B) construct(a: A, b: B) {}` |

Order: constructor, then fields (base class first), then methods.

Wrappers:

- `optional(T)` gives `undefined` when nothing is registered.
- `all(T)` gives every registration of `T`, from this scope and its parents (parents first), as an array.

```ts
@inject(optional(IAnalytics)) analytics?: IAnalytics;
@inject(all(IShopItem)) items!: IShopItem[];
```

**Forward references**: `@inject(() => Foo)`. Use them when `Foo` is not defined yet when the decorator runs, which happens with circular imports. Without one, the decorator reports the problem:

```
[Injector] @inject on Enemy.target: argument 1 is undefined. This usually means a circular import: write @inject(() => TheClass) instead.
```

**Why write tokens out?** The Cocos TypeScript compiler (Babel) keeps no parameter types at runtime and has no parameter decorators. So `constructor(private ads: IAds)` alone can't be injected: name the tokens with `@inject`.

## Registering

All of this happens in `configure(builder)` of a LifetimeScope, or in `createScope((builder) => …)`.

```ts
builder.register(AudioService, Lifetime.Singleton);                 // the class itself
builder.register(AdMobAds, Lifetime.Singleton).as(IAds);            // only as IAds
builder.register(AdMobAds, Lifetime.Singleton).as(IAds).asSelf();   // as IAds and AdMobAds
builder.register(Ship, Lifetime.Transient).withParameter(Speed, 5); // one dependency given here
builder.registerInstance(this.config);                              // an existing object (not disposed)
builder.registerInstance(3).as(LevelNumber);
builder.registerFactory(SpawnEnemy, (r) => (hp) => new Enemy(hp, r.resolve(AudioService)), Lifetime.Scoped);
builder.registerEntryPoint(GamePresenter);                          // see Entry points
builder.registerBuildCallback((container) => { /* after the build */ });
builder.registerEntryPointExceptionHandler((e) => reportCrash(e));
builder.exists(IAds);                                               // already registered here or in a parent?
```

- **`registerFactory(token, fn, lifetime)`** registers what `fn` returns. This is VContainer's `Register<T>(resolver => …)`. To inject a factory, return a function, as `SpawnEnemy` does above.
- **Registering a token twice**: the last registration wins. `all(T)` and `resolveAll(T)` return all of them.

**Components** (Cocos):

| Call | What it does |
|---|---|
| `registerComponent(this.hud)` | an existing component, injected when the scope is built |
| `registerComponentInHierarchy(HudView)` | the first `HudView` in the scope's scene, inactive nodes included |
| `registerComponentOnNewNode(AudioPlayer, Lifetime.Singleton, 'Audio')` | a new node with that component, made when first resolved |
| `registerComponentInNewPrefab(prefab, Enemy, Lifetime.Transient)` | an instance of the prefab, made when resolved |

The last two take options:

- `.under(node)`: the parent node. The default is the scene root.
- `.dontDestroyOnLoad()`: a persistent root node.

Components made this way are injected before their `onLoad`. A Singleton or Scoped one is destroyed with its scope.

## Lifetimes and scopes

| Lifetime | Instances |
|---|---|
| `Singleton` | one, made by the scope that registered it, and shared with its child scopes |
| `Scoped` | one per scope: each child scope makes its own |
| `Transient` | a new one every time it is resolved; not kept, not disposed |

- **Scopes form a tree**: the root, then scene scopes, then child scopes. A scope resolves from itself first, then its parents.
- **A singleton is made by its own scope**, so it never sees a child scope's registrations. Building fails if it would need one.
- **Disposal**: when a scope is disposed (its node destroyed, or `dispose()`), its child scopes go first. Then the instances it made are disposed in reverse order: Singletons and Scoped ones that have a `dispose()` method. Instances given with `registerInstance` are not disposed.

## LifetimeScope

Add it with **Add Component → Injector → LifetimeScope**, or subclass it and override `configure()`.

| Property | Meaning |
|---|---|
| **Parent** | A dropdown of the LifetimeScope types in the project. The parent is the first loaded scope of that type, in any scene, for example a scope on a persistent node. **None** means the [root scope](#the-root-scope), or no parent when there is none. |
| **Auto Run** | Build the container when the node loads. Turn it off to call `build()` yourself. |
| **Auto Inject Nodes** | These nodes and all their children (inactive ones too) get their `@inject` members filled when the container is built. |

**Timing.** LifetimeScope runs with `executionOrder(-5000)`, so its `onLoad` comes before the other components' `onLoad` in the same scene. Components under the Auto Inject Nodes are therefore injected **before their `onLoad`**.

**A parent that isn't loaded yet.** The scope waits and is built as soon as the parent is, with a console warning. Its nodes' `onLoad` has then already run. When the parent is in the same scene, it is built first, wherever it is in the hierarchy.

**Skipped nodes.** A node with another LifetimeScope on it is left to that scope, and so are its children.

## The root scope

To have a scope that exists before the first scene and lives across all of them (VContainer's root LifetimeScope):

1. Make a prefab with your root scope on its root node, for example `ProjectLifetimeScope`, which registers save, audio, ads and analytics.
2. Name it **`RootLifetimeScope`** and put it in a **`resources`** folder (`assets/resources/RootLifetimeScope.prefab`).

When the game starts, the prefab is loaded before the first scene. It is created as a persistent root node, and every scope whose **Parent** is None becomes its child. This works in builds, browser previews and Play in Editor. You can play any scene directly and the global services are still there. `LifetimeScope.root` returns it.

## Prefabs, runtime objects and child scopes

```ts
// Instantiate and inject (before onLoad); the same as cc.instantiate + addChild otherwise.
const node = container.instantiate(this.enemyPrefab, this.enemyRoot);
container.injectNode(someNode);            // inject an existing tree
container.inject(plainObject);             // fill an object's @inject members
```

- **A prefab with its own LifetimeScope**, instantiated this way, becomes a **child scope** of the container that instantiated it.
- **`scope.createChildFromPrefab(prefab, installer?)`** does the same and passes extra registrations.
- **`scope.createChild(installer?)`** makes a child scope on a new node.

**Passing data to the next scene** (VContainer's `Enqueue`):

```ts
const extra = LifetimeScope.enqueue((b) => b.registerInstance(new LevelData(5)));
director.loadScene('Game', () => extra.dispose());
```

Every scope built while the handle is open gets these registrations.

`LifetimeScope.enqueueParent(scope)` works the same way for the parent of the scopes built in that time.

## Entry points

Plain classes the scope drives, for game logic that doesn't belong to a node:

```ts
export class GamePresenter implements Startable, Tickable, Disposable {
    start() {}
    tick(dt: number) {}
    dispose() {}
}
builder.registerEntryPoint(GamePresenter);   // Singleton by default
```

| Interface | Method | When (in a Cocos frame) |
|---|---|---|
| `Initializable` / `PostInitializable` | `initialize()` / `postInitialize()` | right after the scope is built |
| `Startable` / `PostStartable` | `start()` / `postStart()` | next frame, before the components' `update` (once) |
| `AsyncStartable` | `startAsync(cancellation)` | with `start`; cancelled when the scope is disposed |
| `FixedTickable` / `PostFixedTickable` | `fixedTick(dt)` / `postFixedTick(dt)` | at a fixed rate before `tick` (`EntryPoints.fixedTimeStep`, 1/60 by default) |
| `Tickable` | `tick(dt)` | every frame, before the components' `update` |
| `PostTickable` / `LateTickable` | `postTick(dt)` / `lateTick(dt)` | after the components' `update`, before their `lateUpdate` |
| `PostLateTickable` | `postLateTick(dt)` | after the components' `lateUpdate` |
| `Disposable` | `dispose()` | when the scope is disposed |

The interfaces are only for typing: a method with the right name is enough.

- **Errors**: an error in one entry point is logged as `[Injector] GamePresenter.tick(): …`, or sent to `registerEntryPointExceptionHandler`, and the others keep running.
- **Pause**: entry points stop with the game, like `director.pause()`.

```ts
export class Boot implements AsyncStartable {
    async startAsync(cancellation: CancellationToken) {
        await loadBundles();
        cancellation.throwIfCancelled();   // the scene was left meanwhile
        // ...
    }
}
```

## Resolving by hand

Prefer injection. Resolving by hand is for tools, tests and glue code.

```ts
const c = LifetimeScope.find(GameLifetimeScope)!.container!;
c.resolve(AudioService);
c.tryResolve(IAnalytics);          // undefined when not registered
c.resolveAll(IShopItem);
c.instantiate(Enemy);              // an unregistered class, with its dependencies
const child = c.createScope((b) => b.register(Wave, Lifetime.Scoped), 'Wave 3');
child.dispose();
```

A container also resolves `Container` (itself) and `LifetimeScope` (its scope), which is useful for factories.

Containers without Cocos, in tests or a server:

```ts
const b = new ContainerBuilder(null, 'Test');
b.register(Foo, Lifetime.Singleton);
const c = b.build();
```

## Errors

Building a scope checks every class it registers and reports everything at once:

```
[Injector] The scope "GameLifetimeScope" can't be built:
  - ShopPresenter needs IAnalytics (constructor parameter 4), which is not registered.
  - Circular dependency: Enemy → Spawner → Enemy.
```

Resolving names who asked:

```
[Injector] No registration for IAds, needed by ShopView.ads, in the scope "LifetimeScope (Popup)" or its parents. Register it in configure().
```

## Injector Diagnostics

Open **Panel → Injector Diagnostics** (or **Extension → Injector → Injector Diagnostics**), then press Play or open a browser preview.

**Toolbar**:

- the connected game;
- **Search types**;
- **Flatten Hierarchy**: every registration in one list, with its scope;
- counts of scopes, registrations and entry points;
- **LAN**.

**Table**: the scope tree, with each scope's registrations listed under it. Columns: **Type**, **Contract Types** (the tokens it answers to), **Lifetime**, **Register** (how it was registered), **Instances** (held by the scope) and **Resolves**.

**Detail pane**:

- **For a registration**: its **Dependencies** (each injection point and where it resolves from, or *not registered*), **Injected Into** (the registrations that ask for it), and its **Instances** with their field values.
- **For a scope**: its entry points, and the objects it injected, with node paths.

**How it connects**:

- The editor listens on the first free port of **7471–7473**.
- Debug builds (Play in Editor, browser previews) connect to it by themselves.
- Release builds don't connect.
- The window is read-only: it sends a fixed set of requests and nothing else runs in the game.

**Phones and other PCs**:

1. Tick **LAN**.
2. Open the preview URL with the PC's IP address on the device.
3. Allow the ports through the firewall.

## With ScriptableObject and ECS

**ScriptableObject** assets (the scriptable-object extension) are objects: register them as instances.

```ts
@property(GameConfig) config: GameConfig | null = null;
protected configure(b: ContainerBuilder) {
    b.registerInstance(this.config!);   // @inject(GameConfig) anywhere below
}
```

**ECS** systems are created by their world, not by the container. Fill them after the build:

```ts
b.registerBuildCallback((c) => {
    for (const s of defaultWorld()!.systemList) c.inject(s);   // systems with @inject fields
});
```

## Cocos rules to know

- **One Component class per script file.** A second one fails with "Each script can have at most one Component" and then "Cannot set properties of null (setting '_sealed')". Services and other plain classes can share a file.
- **No parameter types at runtime.** Write tokens in `@inject(...)`. See [`@inject`](#inject).
- **Circular imports** leave a class `undefined` when a decorator runs. Use `@inject(() => Foo)`.
- **`cc.instantiate` doesn't inject.** Use `container.instantiate(prefab, parent)`, or `container.injectNode(node)` before adding the node to the scene.

## Development

```
extensions/injector
├─ assets/              runtime (mounted as db://injector)
│  ├─ core/             tokens, @inject, builder, container, entry points (no engine code)
│  ├─ cocos/            LifetimeScope, root scope, node and component injection, frame runner
│  └─ debug/agent.ts    the game side of the Diagnostics window
├─ source/              editor side: diagnostics server (main process), Diagnostics panel (Vue 3)
├─ static/              panel style, icon
└─ tests/               Node tests (fake engine), headless preview of the panel
```

```bash
npm install
npm run build        # typecheck + bundle dist/
npm test             # container, LifetimeScope (on a fake engine), diagnostics bridge
npm run preview      # tests/preview/out/preview.html: the window against live scopes in the page
```

Open `tests/preview/out/preview.html#interact` to run the window's checks in a browser.

After changing `source/` or `package.json`, rebuild and reload the extension. Changes under `assets/` are compiled by Cocos like any script.
