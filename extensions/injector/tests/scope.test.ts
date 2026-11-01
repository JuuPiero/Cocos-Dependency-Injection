/** LifetimeScope and the Cocos layer, on the fake engine (tests/stubs/fake-cc.ts). */
import assert from 'assert';
import type * as CC from 'cc';
// The same module 'cc' is aliased to (tests/run.js), typed as the real engine.
import * as fake from './stubs/fake-cc';
import { Container, ContainerBuilder, Lifetime, LifetimeScope, diagnosticsAnswer, inject } from '../assets';
import { done, test } from './harness';

const { _decorator, Component, Node, Scene } = fake as unknown as typeof CC;
type Node = CC.Node;
const { ccclass } = _decorator;
const prefabOf = (n: Node) => new fake.Prefab(n as any) as unknown as CC.Prefab;
const runScene = (s: CC.Scene) => fake.director.runScene(s as any);
const tick = () => fake.director.tick();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

abstract class IAds {
    abstract show(): string;
}

class FakeAds extends IAds {
    show() {
        return 'ad';
    }
}

class Audio {
    disposed = false;
    dispose() {
        this.disposed = true;
    }
}

class Level {
    constructor(readonly number: number) {}
}

const ticks: string[] = [];

@inject(IAds)
class Presenter {
    constructor(readonly ads: IAds) {}
    start() { ticks.push('start'); }
    tick() { ticks.push('tick'); }
    postTick() { ticks.push('postTick'); }
    lateTick() { ticks.push('lateTick'); }
    postLateTick() { ticks.push('postLateTick'); }
}

@ccclass('ProjectScope')
class ProjectScope extends LifetimeScope {
    protected configure(b: ContainerBuilder) {
        b.register(Audio, Lifetime.Singleton);
    }
}

@ccclass('GameScope')
class GameScope extends LifetimeScope {
    protected configure(b: ContainerBuilder) {
        b.register(FakeAds, Lifetime.Singleton).as(IAds);
        b.registerEntryPoint(Presenter);
    }
}

@ccclass('ShopView')
class ShopView extends Component {
    @inject(IAds) ads!: IAds;
    @inject(Audio) audio!: Audio;
    sawAtLoad = '';
    onLoad() {
        this.sawAtLoad = this.ads ? this.ads.show() : 'nothing';
    }
}

function scope<T extends LifetimeScope>(parent: Node, type: new () => T, name: string, init?: (s: T) => void): T {
    const n = new Node(name);
    const s = n.addComponent(type);
    init?.(s);
    n.parent = parent;
    return s;
}

(async () => {
    await test('a scene scope injects its nodes before their onLoad; entry points follow the frame', () => {
        const scene = new Scene('Main');
        const canvas = new Node('Canvas');
        const shop = new Node('Shop').addComponent(ShopView);
        shop.node.parent = canvas;
        canvas.parent = scene;
        // The child scope comes first in the tree: it builds its parent first.
        const game = scope(scene, GameScope, 'Game', (s) => {
            s.parentReference = 'ProjectScope';
            s.autoInjectNodes = [canvas];
        });
        const project = scope(scene, ProjectScope, 'Project');
        ticks.length = 0;
        runScene(scene);
        assert.ok(project.container && game.container, 'both built');
        assert.strictEqual(game.container!.parent, project.container, 'parent by type');
        assert.strictEqual(shop.sawAtLoad, 'ad', 'injected before onLoad');
        assert.strictEqual(shop.audio, project.container!.resolve(Audio), 'from the parent scope');
        tick();
        assert.deepStrictEqual(ticks, ['start', 'tick', 'postTick', 'lateTick', 'postLateTick']);
    });

    await test('a scope waits for a parent that is not loaded yet', async () => {
        const scene = new Scene('Waiting');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        const warn = console.warn;
        let warned = '';
        console.warn = (m: string) => (warned = m);
        try {
            runScene(scene);
        } finally {
            console.warn = warn;
        }
        assert.strictEqual(game.container === null, true, 'not built yet');
        assert.match(warned, /GameScope waits for its parent \(ProjectScope\)/);
        const project = scope(scene, ProjectScope, 'Project');
        assert.ok(project.container && game.container, 'built as soon as the parent is');
        assert.strictEqual(game.container!.parent, project.container);
    });

    await test('container.instantiate injects a prefab; a scope in it becomes a child scope', () => {
        const scene = new Scene('Prefabs');
        const project = scope(scene, ProjectScope, 'Project');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        runScene(scene);

        const viewTemplate = new Node('ShopPrefab');
        viewTemplate.addComponent(ShopView);
        const view = game.instantiate(prefabOf(viewTemplate), scene).getComponent(ShopView)!;
        assert.strictEqual(view.sawAtLoad, 'ad');

        @ccclass('PopupScope')
        class PopupScope extends LifetimeScope {
            protected configure(b: ContainerBuilder) {
                b.registerInstance(new Level(3));
            }
        }
        const popupTemplate = new Node('Popup');
        popupTemplate.addComponent(PopupScope);
        const inner = new Node('Inner');
        inner.addComponent(ShopView);
        inner.parent = popupTemplate;
        popupTemplate.getComponent(PopupScope)!.autoInjectNodes = [];
        const popupNode = game.instantiate(prefabOf(popupTemplate), scene);
        const popup = popupNode.getComponent(PopupScope)!;
        assert.strictEqual(popup.container!.parent, game.container, 'child of the instantiating scope');
        assert.strictEqual(popup.container!.resolve(Level).number, 3);
        assert.strictEqual(popupNode.getChildByName('Inner')!.getComponent(ShopView)!.ads, undefined, 'left to the popup scope');
        popupNode.destroy();
        assert.ok(popup.container === null && !Container.all.has(popup.container as any), 'disposed with its node');
        assert.ok(project.container && !game.container!.disposed);
    });

    await test('component registrations: existing, in hierarchy, on a new node, in a new prefab', () => {
        @ccclass('Hud') class Hud extends Component {
            @inject(IAds) ads!: IAds;
        }
        @ccclass('Player') class Player extends Component {
            @inject(Audio) audio!: Audio;
        }
        @ccclass('Enemy') class Enemy extends Component {}
        const enemyTemplate = new Node('EnemyPrefab');
        enemyTemplate.addComponent(Enemy);

        @ccclass('CompScope')
        class CompScope extends LifetimeScope {
            hud: Hud | null = null;
            protected configure(b: ContainerBuilder) {
                b.register(FakeAds, Lifetime.Singleton).as(IAds);
                b.register(Audio, Lifetime.Singleton);
                b.registerComponent(this.hud!);
                b.registerComponentInHierarchy(Player);
                b.registerComponentInNewPrefab(prefabOf(enemyTemplate), Enemy, Lifetime.Transient);
            }
        }
        const scene = new Scene('Components');
        const hud = new Node('Hud').addComponent(Hud);
        hud.node.parent = scene;
        const player = new Node('Player').addComponent(Player);
        player.node.active = false;
        player.node.parent = scene;
        const s = scope(scene, CompScope, 'Scope', (x) => (x.hud = hud));
        runScene(scene);
        const c = s.container!;
        assert.strictEqual(c.resolve(Hud), hud);
        assert.ok(hud.ads instanceof FakeAds, 'registered components are injected');
        assert.strictEqual(c.resolve(Player), player, 'found on an inactive node');
        assert.ok(player.audio instanceof Audio);
        const e1 = c.resolve(Enemy);
        const e2 = c.resolve(Enemy);
        assert.ok(e1 !== e2 && e1.node.parent === scene, 'transient prefab instances under the scene');
        s.node.destroy();
        assert.ok(e1.node.isValid, 'transient instances are not owned');
    });

    await test('a new node component is made on resolve and destroyed with the scope', () => {
        @ccclass('Spawner') class Spawner extends Component {
            @inject(IAds) ads!: IAds;
            loadedWith = '';
            onLoad() {
                this.loadedWith = this.ads?.show() || '';
            }
        }
        @ccclass('SpawnScope')
        class SpawnScope extends LifetimeScope {
            protected configure(b: ContainerBuilder) {
                b.register(FakeAds, Lifetime.Singleton).as(IAds);
                b.registerComponentOnNewNode(Spawner, Lifetime.Scoped, 'Spawner');
            }
        }
        const scene = new Scene('NewNode');
        const s = scope(scene, SpawnScope, 'Scope');
        runScene(scene);
        const sp = s.container!.resolve(Spawner);
        assert.strictEqual(sp.loadedWith, 'ad', 'injected before onLoad');
        assert.strictEqual(sp.node.parent, scene);
        s.node.destroy();
        assert.ok(!sp.node.isValid, 'destroyed with the scope');
    });

    await test('enqueue() gives data to the next scene; createChild()', () => {
        const scene = new Scene('Enqueued');
        const game = scope(scene, GameScope, 'Game');
        const h = LifetimeScope.enqueue((b) => b.registerInstance(new Level(7)));
        runScene(scene);
        h.dispose();
        assert.strictEqual(game.container!.resolve(Level).number, 7);
        const child = game.createChild((b) => b.register(Audio, Lifetime.Scoped));
        assert.strictEqual(child.container!.parent, game.container);
        assert.ok(child.container!.resolve(Audio) instanceof Audio);
        assert.strictEqual(child.node.parent, game.node);
    });

    await test('diagnostics: scopes, registrations, dependencies and instances', () => {
        const scene = new Scene('Diag');
        scope(scene, ProjectScope, 'Project');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        runScene(scene);
        const o = diagnosticsAnswer({ what: 'overview' });
        const g = o.scopes.find((s: any) => s.id === game.container!.id);
        const p = o.scopes.find((s: any) => s.type === 'ProjectScope');
        assert.ok(g && p && g.parent === p.id && g.node === 'Game');
        const sc = diagnosticsAnswer({ what: 'scope', params: { id: g.id } });
        const ads = sc.items.find((r: any) => r.contracts.includes('IAds'));
        assert.strictEqual(ads.lifetime, 'Singleton');
        const presenter = sc.items.find((r: any) => r.entryPoint);
        const detail = diagnosticsAnswer({ what: 'registration', params: { scope: g.id, id: presenter.id } });
        assert.deepStrictEqual(detail.dependencies.map((d: any) => [d.token, d.from]), [['IAds', `FakeAds · ${g.name}`]]);
        const adsDetail = diagnosticsAnswer({ what: 'registration', params: { scope: g.id, id: ads.id } });
        assert.ok(adsDetail.dependents.some((d: string) => d.startsWith('Presenter')));
        assert.strictEqual(adsDetail.instances[0].type, 'FakeAds');
    });

    await test('the root scope: resources/RootLifetimeScope, before the scene scopes, kept across scenes', async () => {
        @ccclass('RootScope')
        class RootScope extends LifetimeScope {
            protected configure(b: ContainerBuilder) {
                b.register(Audio, Lifetime.Singleton);
                b.register(FakeAds, Lifetime.Singleton).as(IAds);
            }
        }
        const rootTemplate = new Node('Root');
        rootTemplate.addComponent(RootScope);
        fake.assetManager.resources = new fake.FakeBundle({ RootLifetimeScope: prefabOf(rootTemplate) });

        const scene = new Scene('First');
        const shop = new Node('Shop').addComponent(ShopView);
        shop.node.parent = scene;
        const s = scope(scene, LifetimeScope, 'Scope', (x) => (x.autoInjectNodes = [shop.node]));
        const warn = console.warn;
        console.warn = () => undefined;
        try {
            runScene(scene);
            await wait(20);
        } finally {
            console.warn = warn;
        }
        const root = LifetimeScope.root!;
        assert.ok(root && root.isRoot && root.container, 'loaded and built');
        assert.strictEqual(s.container!.parent, root.container, 'scopes without a parent use the root');
        assert.ok(shop.audio instanceof Audio);
        const audio = root.container!.resolve(Audio);

        const next = new Scene('Second');
        const s2 = scope(next, LifetimeScope, 'Scope');
        runScene(next);
        assert.strictEqual(LifetimeScope.root, root, 'kept across scenes');
        assert.strictEqual(root.node.parent, next);
        assert.strictEqual(s2.container!.resolve(Audio), audio);
        assert.ok(!audio.disposed);
    });

    done();
})();
