"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** LifetimeScope and the Cocos layer, on the fake engine (tests/stubs/fake-cc.ts). */
const assert_1 = __importDefault(require("assert"));
const cc_1 = require("cc");
const assets_1 = require("../assets");
const harness_1 = require("./harness");
const { ccclass } = cc_1._decorator;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
class IAds {
}
class FakeAds extends IAds {
    show() {
        return 'ad';
    }
}
class Audio {
    constructor() {
        this.disposed = false;
    }
    dispose() {
        this.disposed = true;
    }
}
class Level {
    constructor(number) {
        this.number = number;
    }
}
const ticks = [];
let Presenter = class Presenter {
    constructor(ads) {
        this.ads = ads;
    }
    start() { ticks.push('start'); }
    tick() { ticks.push('tick'); }
    postTick() { ticks.push('postTick'); }
    lateTick() { ticks.push('lateTick'); }
    postLateTick() { ticks.push('postLateTick'); }
};
Presenter = __decorate([
    (0, assets_1.inject)(IAds)
], Presenter);
let ProjectScope = class ProjectScope extends assets_1.LifetimeScope {
    configure(b) {
        b.register(Audio, assets_1.Lifetime.Singleton);
    }
};
ProjectScope = __decorate([
    ccclass('ProjectScope')
], ProjectScope);
let GameScope = class GameScope extends assets_1.LifetimeScope {
    configure(b) {
        b.register(FakeAds, assets_1.Lifetime.Singleton).as(IAds);
        b.registerEntryPoint(Presenter);
    }
};
GameScope = __decorate([
    ccclass('GameScope')
], GameScope);
let ShopView = class ShopView extends cc_1.Component {
    constructor() {
        super(...arguments);
        this.sawAtLoad = '';
    }
    onLoad() {
        this.sawAtLoad = this.ads ? this.ads.show() : 'nothing';
    }
};
__decorate([
    (0, assets_1.inject)(IAds)
], ShopView.prototype, "ads", void 0);
__decorate([
    (0, assets_1.inject)(Audio)
], ShopView.prototype, "audio", void 0);
ShopView = __decorate([
    ccclass('ShopView')
], ShopView);
function scope(parent, type, name, init) {
    const n = new cc_1.Node(name);
    const s = n.addComponent(type);
    init === null || init === void 0 ? void 0 : init(s);
    n.parent = parent;
    return s;
}
(async () => {
    await (0, harness_1.test)('a scene scope injects its nodes before their onLoad; entry points follow the frame', () => {
        const scene = new cc_1.Scene('Main');
        const canvas = new cc_1.Node('Canvas');
        const shop = new cc_1.Node('Shop').addComponent(ShopView);
        shop.node.parent = canvas;
        canvas.parent = scene;
        // The child scope comes first in the tree: it builds its parent first.
        const game = scope(scene, GameScope, 'Game', (s) => {
            s.parentReference = 'ProjectScope';
            s.autoInjectNodes = [canvas];
        });
        const project = scope(scene, ProjectScope, 'Project');
        ticks.length = 0;
        cc_1.director.runScene(scene);
        assert_1.default.ok(project.container && game.container, 'both built');
        assert_1.default.strictEqual(game.container.parent, project.container, 'parent by type');
        assert_1.default.strictEqual(shop.sawAtLoad, 'ad', 'injected before onLoad');
        assert_1.default.strictEqual(shop.audio, project.container.resolve(Audio), 'from the parent scope');
        cc_1.director.tick();
        assert_1.default.deepStrictEqual(ticks, ['start', 'tick', 'postTick', 'lateTick', 'postLateTick']);
    });
    await (0, harness_1.test)('a scope waits for a parent that is not loaded yet', async () => {
        const scene = new cc_1.Scene('Waiting');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        const warn = console.warn;
        let warned = '';
        console.warn = (m) => (warned = m);
        try {
            cc_1.director.runScene(scene);
        }
        finally {
            console.warn = warn;
        }
        assert_1.default.strictEqual(game.container, null);
        assert_1.default.match(warned, /GameScope waits for its parent \(ProjectScope\)/);
        const project = scope(scene, ProjectScope, 'Project');
        assert_1.default.ok(project.container && game.container, 'built as soon as the parent is');
        assert_1.default.strictEqual(game.container.parent, project.container);
    });
    await (0, harness_1.test)('container.instantiate injects a prefab; a scope in it becomes a child scope', () => {
        const scene = new cc_1.Scene('Prefabs');
        const project = scope(scene, ProjectScope, 'Project');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        cc_1.director.runScene(scene);
        const viewTemplate = new cc_1.Node('ShopPrefab');
        viewTemplate.addComponent(ShopView);
        const view = game.instantiate(new cc_1.Prefab(viewTemplate), scene).getComponent(ShopView);
        assert_1.default.strictEqual(view.sawAtLoad, 'ad');
        let PopupScope = class PopupScope extends assets_1.LifetimeScope {
            configure(b) {
                b.registerInstance(new Level(3));
            }
        };
        PopupScope = __decorate([
            ccclass('PopupScope')
        ], PopupScope);
        const popupTemplate = new cc_1.Node('Popup');
        popupTemplate.addComponent(PopupScope);
        const inner = new cc_1.Node('Inner');
        inner.addComponent(ShopView);
        inner.parent = popupTemplate;
        popupTemplate.getComponent(PopupScope).autoInjectNodes = [];
        const popupNode = game.instantiate(new cc_1.Prefab(popupTemplate), scene);
        const popup = popupNode.getComponent(PopupScope);
        assert_1.default.strictEqual(popup.container.parent, game.container, 'child of the instantiating scope');
        assert_1.default.strictEqual(popup.container.resolve(Level).number, 3);
        assert_1.default.strictEqual(popupNode.getChildByName('Inner').getComponent(ShopView).ads, undefined, 'left to the popup scope');
        popupNode.destroy();
        assert_1.default.ok(popup.container === null && !assets_1.Container.all.has(popup.container), 'disposed with its node');
        assert_1.default.ok(project.container && !game.container.disposed);
    });
    await (0, harness_1.test)('component registrations: existing, in hierarchy, on a new node, in a new prefab', () => {
        let Hud = class Hud extends cc_1.Component {
        };
        __decorate([
            (0, assets_1.inject)(IAds)
        ], Hud.prototype, "ads", void 0);
        Hud = __decorate([
            ccclass('Hud')
        ], Hud);
        let Player = class Player extends cc_1.Component {
        };
        __decorate([
            (0, assets_1.inject)(Audio)
        ], Player.prototype, "audio", void 0);
        Player = __decorate([
            ccclass('Player')
        ], Player);
        let Enemy = class Enemy extends cc_1.Component {
        };
        Enemy = __decorate([
            ccclass('Enemy')
        ], Enemy);
        const enemyTemplate = new cc_1.Node('EnemyPrefab');
        enemyTemplate.addComponent(Enemy);
        let CompScope = class CompScope extends assets_1.LifetimeScope {
            constructor() {
                super(...arguments);
                this.hud = null;
            }
            configure(b) {
                b.register(FakeAds, assets_1.Lifetime.Singleton).as(IAds);
                b.register(Audio, assets_1.Lifetime.Singleton);
                b.registerComponent(this.hud);
                b.registerComponentInHierarchy(Player);
                b.registerComponentInNewPrefab(new cc_1.Prefab(enemyTemplate), Enemy, assets_1.Lifetime.Transient);
            }
        };
        CompScope = __decorate([
            ccclass('CompScope')
        ], CompScope);
        const scene = new cc_1.Scene('Components');
        const hud = new cc_1.Node('Hud').addComponent(Hud);
        hud.node.parent = scene;
        const player = new cc_1.Node('Player').addComponent(Player);
        player.node.active = false;
        player.node.parent = scene;
        const s = scope(scene, CompScope, 'Scope', (x) => (x.hud = hud));
        cc_1.director.runScene(scene);
        const c = s.container;
        assert_1.default.strictEqual(c.resolve(Hud), hud);
        assert_1.default.ok(hud.ads instanceof FakeAds, 'registered components are injected');
        assert_1.default.strictEqual(c.resolve(Player), player, 'found on an inactive node');
        assert_1.default.ok(player.audio instanceof Audio);
        const e1 = c.resolve(Enemy);
        const e2 = c.resolve(Enemy);
        assert_1.default.ok(e1 !== e2 && e1.node.parent === scene, 'transient prefab instances under the scene');
        s.node.destroy();
        assert_1.default.ok(e1.node.isValid, 'transient instances are not owned');
    });
    await (0, harness_1.test)('a new node component is made on resolve and destroyed with the scope', () => {
        let Spawner = class Spawner extends cc_1.Component {
            constructor() {
                super(...arguments);
                this.loadedWith = '';
            }
            onLoad() {
                var _a;
                this.loadedWith = ((_a = this.ads) === null || _a === void 0 ? void 0 : _a.show()) || '';
            }
        };
        __decorate([
            (0, assets_1.inject)(IAds)
        ], Spawner.prototype, "ads", void 0);
        Spawner = __decorate([
            ccclass('Spawner')
        ], Spawner);
        let SpawnScope = class SpawnScope extends assets_1.LifetimeScope {
            configure(b) {
                b.register(FakeAds, assets_1.Lifetime.Singleton).as(IAds);
                b.registerComponentOnNewNode(Spawner, assets_1.Lifetime.Scoped, 'Spawner');
            }
        };
        SpawnScope = __decorate([
            ccclass('SpawnScope')
        ], SpawnScope);
        const scene = new cc_1.Scene('NewNode');
        const s = scope(scene, SpawnScope, 'Scope');
        cc_1.director.runScene(scene);
        const sp = s.container.resolve(Spawner);
        assert_1.default.strictEqual(sp.loadedWith, 'ad', 'injected before onLoad');
        assert_1.default.strictEqual(sp.node.parent, scene);
        s.node.destroy();
        assert_1.default.ok(!sp.node.isValid, 'destroyed with the scope');
    });
    await (0, harness_1.test)('enqueue() gives data to the next scene; createChild()', () => {
        const scene = new cc_1.Scene('Enqueued');
        const game = scope(scene, GameScope, 'Game');
        const h = assets_1.LifetimeScope.enqueue((b) => b.registerInstance(new Level(7)));
        cc_1.director.runScene(scene);
        h.dispose();
        assert_1.default.strictEqual(game.container.resolve(Level).number, 7);
        const child = game.createChild((b) => b.register(Audio, assets_1.Lifetime.Scoped));
        assert_1.default.strictEqual(child.container.parent, game.container);
        assert_1.default.ok(child.container.resolve(Audio) instanceof Audio);
        assert_1.default.strictEqual(child.node.parent, game.node);
    });
    await (0, harness_1.test)('diagnostics: scopes, registrations, dependencies and instances', () => {
        const scene = new cc_1.Scene('Diag');
        scope(scene, ProjectScope, 'Project');
        const game = scope(scene, GameScope, 'Game', (s) => (s.parentReference = 'ProjectScope'));
        cc_1.director.runScene(scene);
        const o = (0, assets_1.diagnosticsAnswer)({ what: 'overview' });
        const g = o.scopes.find((s) => s.id === game.container.id);
        const p = o.scopes.find((s) => s.type === 'ProjectScope');
        assert_1.default.ok(g && p && g.parent === p.id && g.node === 'Game');
        const sc = (0, assets_1.diagnosticsAnswer)({ what: 'scope', params: { id: g.id } });
        const ads = sc.items.find((r) => r.contracts.includes('IAds'));
        assert_1.default.strictEqual(ads.lifetime, 'Singleton');
        const presenter = sc.items.find((r) => r.entryPoint);
        const detail = (0, assets_1.diagnosticsAnswer)({ what: 'registration', params: { scope: g.id, id: presenter.id } });
        assert_1.default.deepStrictEqual(detail.dependencies.map((d) => [d.token, d.from]), [['IAds', `FakeAds · ${g.name}`]]);
        const adsDetail = (0, assets_1.diagnosticsAnswer)({ what: 'registration', params: { scope: g.id, id: ads.id } });
        assert_1.default.ok(adsDetail.dependents.some((d) => d.startsWith('Presenter')));
        assert_1.default.strictEqual(adsDetail.instances[0].type, 'FakeAds');
    });
    await (0, harness_1.test)('the root scope: resources/RootLifetimeScope, before the scene scopes, kept across scenes', async () => {
        let RootScope = class RootScope extends assets_1.LifetimeScope {
            configure(b) {
                b.register(Audio, assets_1.Lifetime.Singleton);
                b.register(FakeAds, assets_1.Lifetime.Singleton).as(IAds);
            }
        };
        RootScope = __decorate([
            ccclass('RootScope')
        ], RootScope);
        const rootTemplate = new cc_1.Node('Root');
        rootTemplate.addComponent(RootScope);
        cc_1.assetManager.resources = new cc_1.FakeBundle({ RootLifetimeScope: new cc_1.Prefab(rootTemplate) });
        const scene = new cc_1.Scene('First');
        const shop = new cc_1.Node('Shop').addComponent(ShopView);
        shop.node.parent = scene;
        const s = scope(scene, assets_1.LifetimeScope, 'Scope', (x) => (x.autoInjectNodes = [shop.node]));
        const warn = console.warn;
        console.warn = () => undefined;
        try {
            cc_1.director.runScene(scene);
            await wait(20);
        }
        finally {
            console.warn = warn;
        }
        const root = assets_1.LifetimeScope.root;
        assert_1.default.ok(root && root.isRoot && root.container, 'loaded and built');
        assert_1.default.strictEqual(s.container.parent, root.container, 'scopes without a parent use the root');
        assert_1.default.ok(shop.audio instanceof Audio);
        const audio = root.container.resolve(Audio);
        const next = new cc_1.Scene('Second');
        const s2 = scope(next, assets_1.LifetimeScope, 'Scope');
        cc_1.director.runScene(next);
        assert_1.default.strictEqual(assets_1.LifetimeScope.root, root, 'kept across scenes');
        assert_1.default.strictEqual(root.node.parent, next);
        assert_1.default.strictEqual(s2.container.resolve(Audio), audio);
        assert_1.default.ok(!audio.disposed);
    });
    (0, harness_1.done)();
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NvcGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjb3BlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSxzRkFBc0Y7QUFDdEYsb0RBQTRCO0FBQzVCLDJCQUFvRztBQUNwRyxzQ0FBNEc7QUFDNUcsdUNBQXVDO0FBRXZDLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxlQUFVLENBQUM7QUFDL0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxFQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFbkUsTUFBZSxJQUFJO0NBRWxCO0FBRUQsTUFBTSxPQUFRLFNBQVEsSUFBSTtJQUN0QixJQUFJO1FBQ0EsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztDQUNKO0FBRUQsTUFBTSxLQUFLO0lBQVg7UUFDSSxhQUFRLEdBQUcsS0FBSyxDQUFDO0lBSXJCLENBQUM7SUFIRyxPQUFPO1FBQ0gsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDekIsQ0FBQztDQUNKO0FBRUQsTUFBTSxLQUFLO0lBQ1AsWUFBcUIsTUFBYztRQUFkLFdBQU0sR0FBTixNQUFNLENBQVE7SUFBRyxDQUFDO0NBQzFDO0FBRUQsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0FBRzNCLElBQU0sU0FBUyxHQUFmLE1BQU0sU0FBUztJQUNYLFlBQXFCLEdBQVM7UUFBVCxRQUFHLEdBQUgsR0FBRyxDQUFNO0lBQUcsQ0FBQztJQUNsQyxLQUFLLEtBQUssS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLFFBQVEsS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLFVB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QyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLFNBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxjQUFjLENBQUMsQ0FBQztRQUMvRCxnQkFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDO1FBQzVELE1BQU0sRUFBRSxHQUFHLElBQUEsMEJBQWlCLEVBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3BFLGdCQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDOUMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxNQUFNLE1BQU0sR0FBRyxJQUFBLDBCQUFpQixFQUFDLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RyxnQkFB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QUUsa0JBQWtCLENBQUMsQ0FBQztRQUNyRSxnQkFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBVSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLHNDQUFzQyxDQUFDLENBQUM7UUFDaEcsZ0JBQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QyxNQUFNLElBQUksR0FBRyxJQUFJLFVBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLHNCQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDL0MsYUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixnQkFBTSxDQUFDLFdBQVcsQ0FBQyxzQkFBYSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNuRSxnQkFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxnQkFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsU0FBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4RCxnQkFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUEsY0FBSSxHQUFFLENBQUM7QUFDWCxDQUFDLENBQUMsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqIExpZmV0aW1lU2NvcGUgYW5kIHRoZSBDb2NvcyBsYXllciwgb24gdGhlIGZha2UgZW5naW5lICh0ZXN0cy9zdHVicy9mYWtlLWNjLnRzKS4gKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IF9kZWNvcmF0b3IsIGFzc2V0TWFuYWdlciwgQ29tcG9uZW50LCBkaXJlY3RvciwgRmFrZUJ1bmRsZSwgTm9kZSwgUHJlZmFiLCBTY2VuZSB9IGZyb20gJ2NjJztcbmltcG9ydCB7IENvbnRhaW5lciwgQ29udGFpbmVyQnVpbGRlciwgTGlmZXRpbWUsIExpZmV0aW1lU2NvcGUsIGRpYWdub3N0aWNzQW5zd2VyLCBpbmplY3QgfSBmcm9tICcuLi9hc3NldHMnO1xuaW1wb3J0IHsgZG9uZSwgdGVzdCB9IGZyb20gJy4vaGFybmVzcyc7XG5cbmNvbnN0IHsgY2NjbGFzcyB9ID0gX2RlY29yYXRvcjtcbmNvbnN0IHdhaXQgPSAobXM6IG51bWJlcikgPT4gbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgbXMpKTtcblxuYWJzdHJhY3QgY2xhc3MgSUFkcyB7XG4gICAgYWJzdHJhY3Qgc2hvdygpOiBzdHJpbmc7XG59XG5cbmNsYXNzIEZha2VBZHMgZXh0ZW5kcyBJQWRzIHtcbiAgICBzaG93KCkge1xuICAgICAgICByZXR1cm4gJ2FkJztcbiAgICB9XG59XG5cbmNsYXNzIEF1ZGlvIHtcbiAgICBkaXNwb3NlZCA9IGZhbHNlO1xuICAgIGRpc3Bvc2UoKSB7XG4gICAgICAgIHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuICAgIH1cbn1cblxuY2xhc3MgTGV2ZWwge1xuICAgIGNvbnN0cnVjdG9yKHJlYWRvbmx5IG51bWJlcjogbnVtYmVyKSB7fVxufVxuXG5jb25zdCB0aWNrczogc3RyaW5nW10gPSBbXTtcblxuQGluamVjdChJQWRzKVxuY2xhc3MgUHJlc2VudGVyIHtcbiAgICBjb25zdHJ1Y3RvcihyZWFkb25seSBhZHM6IElBZHMpIHt9XG4gICAgc3RhcnQoKSB7IHRpY2tzLnB1c2goJ3N0YXJ0Jyk7IH1cbiAgICB0aWNrKCkgeyB0aWNrcy5wdXNoKCd0aWNrJyk7IH1cbiAgICBwb3N0VGljaygpIHsgdGlja3MucHVzaCgncG9zdFRpY2snKTsgfVxuICAgIGxhdGVUaWNrKCkgeyB0aWNrcy5wdXNoKCdsYXRlVGljaycpOyB9XG4gICAgcG9zdExhdGVUaWNrKCkgeyB0aWNrcy5wdXNoKCdwb3N0TGF0ZVRpY2snKTsgfVxufVxuXG5AY2NjbGFzcygnUHJvamVjdFNjb3BlJylcbmNsYXNzIFByb2plY3RTY29wZSBleHRlbmRzIExpZmV0aW1lU2NvcGUge1xuICAgIHByb3RlY3RlZCBjb25maWd1cmUoYjogQ29udGFpbmVyQnVpbGRlcikge1xuICAgICAgICBiLnJlZ2lzdGVyKEF1ZGlvLCBMaWZldGltZS5TaW5nbGV0b24pO1xuICAgIH1cbn1cblxuQGNjY2xhc3MoJ0dhbWVTY29wZScpXG5jbGFzcyBHYW1lU2NvcGUgZXh0ZW5kcyBMaWZldGltZVNjb3BlIHtcbiAgICBwcm90ZWN0ZWQgY29uZmlndXJlKGI6IENvbnRhaW5lckJ1aWxkZXIpIHtcbiAgICAgICAgYi5yZWdpc3RlcihGYWtlQWRzLCBMaWZldGltZS5TaW5nbGV0b24pLmFzKElBZHMpO1xuICAgICAgICBiLnJlZ2lzdGVyRW50cnlQb2ludChQcmVzZW50ZXIpO1xuICAgIH1cbn1cblxuQGNjY2xhc3MoJ1Nob3BWaWV3JylcbmNsYXNzIFNob3BWaWV3IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICBAaW5qZWN0KElBZHMpIGFkcyE6IElBZHM7XG4gICAgQGluamVjdChBdWRpbykgYXVkaW8hOiBBdWRpbztcbiAgICBzYXdBdExvYWQgPSAnJztcbiAgICBvbkxvYWQoKSB7XG4gICAgICAgIHRoaXMuc2F3QXRMb2FkID0gdGhpcy5hZHMgPyB0aGlzLmFkcy5zaG93KCkgOiAnbm90aGluZyc7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzY29wZTxUIGV4dGVuZHMgTGlmZXRpbWVTY29wZT4ocGFyZW50OiBOb2RlLCB0eXBlOiBuZXcgKCkgPT4gVCwgbmFtZTogc3RyaW5nLCBpbml0PzogKHM6IFQpID0+IHZvaWQpOiBUIHtcbiAgICBjb25zdCBuID0gbmV3IE5vZGUobmFtZSk7XG4gICAgY29uc3QgcyA9IG4uYWRkQ29tcG9uZW50KHR5cGUpO1xuICAgIGluaXQ/LihzKTtcbiAgICBuLnBhcmVudCA9IHBhcmVudDtcbiAgICByZXR1cm4gcztcbn1cblxuKGFzeW5jICgpID0+IHtcbiAgICBhd2FpdCB0ZXN0KCdhIHNjZW5lIHNjb3BlIGluamVjdHMgaXRzIG5vZGVzIGJlZm9yZSB0aGVpciBvbkxvYWQ7IGVudHJ5IHBvaW50cyBmb2xsb3cgdGhlIGZyYW1lJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZSA9IG5ldyBTY2VuZSgnTWFpbicpO1xuICAgICAgICBjb25zdCBjYW52YXMgPSBuZXcgTm9kZSgnQ2FudmFzJyk7XG4gICAgICAgIGNvbnN0IHNob3AgPSBuZXcgTm9kZSgnU2hvcCcpLmFkZENvbXBvbmVudChTaG9wVmlldyk7XG4gICAgICAgIHNob3Aubm9kZS5wYXJlbnQgPSBjYW52YXM7XG4gICAgICAgIGNhbnZhcy5wYXJlbnQgPSBzY2VuZTtcbiAgICAgICAgLy8gVGhlIGNoaWxkIHNjb3BlIGNvbWVzIGZpcnN0IGluIHRoZSB0cmVlOiBpdCBidWlsZHMgaXRzIHBhcmVudCBmaXJzdC5cbiAgICAgICAgY29uc3QgZ2FtZSA9IHNjb3BlKHNjZW5lLCBHYW1lU2NvcGUsICdHYW1lJywgKHMpID0+IHtcbiAgICAgICAgICAgIHMucGFyZW50UmVmZXJlbmNlID0gJ1Byb2plY3RTY29wZSc7XG4gICAgICAgICAgICBzLmF1dG9JbmplY3ROb2RlcyA9IFtjYW52YXNdO1xuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IHNjb3BlKHNjZW5lLCBQcm9qZWN0U2NvcGUsICdQcm9qZWN0Jyk7XG4gICAgICAgIHRpY2tzLmxlbmd0aCA9IDA7XG4gICAgICAgIGRpcmVjdG9yLnJ1blNjZW5lKHNjZW5lKTtcbiAgICAgICAgYXNzZXJ0Lm9rKHByb2plY3QuY29udGFpbmVyICYmIGdhbWUuY29udGFpbmVyLCAnYm90aCBidWlsdCcpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoZ2FtZS5jb250YWluZXIhLnBhcmVudCwgcHJvamVjdC5jb250YWluZXIsICdwYXJlbnQgYnkgdHlwZScpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoc2hvcC5zYXdBdExvYWQsICdhZCcsICdpbmplY3RlZCBiZWZvcmUgb25Mb2FkJyk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChzaG9wLmF1ZGlvLCBwcm9qZWN0LmNvbnRhaW5lciEucmVzb2x2ZShBdWRpbyksICdmcm9tIHRoZSBwYXJlbnQgc2NvcGUnKTtcbiAgICAgICAgZGlyZWN0b3IudGljaygpO1xuICAgICAgICBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpY2tzLCBbJ3N0YXJ0JywgJ3RpY2snLCAncG9zdFRpY2snLCAnbGF0ZVRpY2snLCAncG9zdExhdGVUaWNrJ10pO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGVzdCgnYSBzY29wZSB3YWl0cyBmb3IgYSBwYXJlbnQgdGhhdCBpcyBub3QgbG9hZGVkIHlldCcsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3Qgc2NlbmUgPSBuZXcgU2NlbmUoJ1dhaXRpbmcnKTtcbiAgICAgICAgY29uc3QgZ2FtZSA9IHNjb3BlKHNjZW5lLCBHYW1lU2NvcGUsICdHYW1lJywgKHMpID0+IChzLnBhcmVudFJlZmVyZW5jZSA9ICdQcm9qZWN0U2NvcGUnKSk7XG4gICAgICAgIGNvbnN0IHdhcm4gPSBjb25zb2xlLndhcm47XG4gICAgICAgIGxldCB3YXJuZWQgPSAnJztcbiAgICAgICAgY29uc29sZS53YXJuID0gKG06IHN0cmluZykgPT4gKHdhcm5lZCA9IG0pO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUoc2NlbmUpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuID0gd2FybjtcbiAgICAgICAgfVxuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoZ2FtZS5jb250YWluZXIsIG51bGwpO1xuICAgICAgICBhc3NlcnQubWF0Y2god2FybmVkLCAvR2FtZVNjb3BlIHdhaXRzIGZvciBpdHMgcGFyZW50IFxcKFByb2plY3RTY29wZVxcKS8pO1xuICAgICAgICBjb25zdCBwcm9qZWN0ID0gc2NvcGUoc2NlbmUsIFByb2plY3RTY29wZSwgJ1Byb2plY3QnKTtcbiAgICAgICAgYXNzZXJ0Lm9rKHByb2plY3QuY29udGFpbmVyICYmIGdhbWUuY29udGFpbmVyLCAnYnVpbHQgYXMgc29vbiBhcyB0aGUgcGFyZW50IGlzJyk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChnYW1lLmNvbnRhaW5lciEucGFyZW50LCBwcm9qZWN0LmNvbnRhaW5lcik7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0ZXN0KCdjb250YWluZXIuaW5zdGFudGlhdGUgaW5qZWN0cyBhIHByZWZhYjsgYSBzY29wZSBpbiBpdCBiZWNvbWVzIGEgY2hpbGQgc2NvcGUnLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gbmV3IFNjZW5lKCdQcmVmYWJzJyk7XG4gICAgICAgIGNvbnN0IHByb2plY3QgPSBzY29wZShzY2VuZSwgUHJvamVjdFNjb3BlLCAnUHJvamVjdCcpO1xuICAgICAgICBjb25zdCBnYW1lID0gc2NvcGUoc2NlbmUsIEdhbWVTY29wZSwgJ0dhbWUnLCAocykgPT4gKHMucGFyZW50UmVmZXJlbmNlID0gJ1Byb2plY3RTY29wZScpKTtcbiAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUoc2NlbmUpO1xuXG4gICAgICAgIGNvbnN0IHZpZXdUZW1wbGF0ZSA9IG5ldyBOb2RlKCdTaG9wUHJlZmFiJyk7XG4gICAgICAgIHZpZXdUZW1wbGF0ZS5hZGRDb21wb25lbnQoU2hvcFZpZXcpO1xuICAgICAgICBjb25zdCB2aWV3ID0gZ2FtZS5pbnN0YW50aWF0ZShuZXcgUHJlZmFiKHZpZXdUZW1wbGF0ZSksIHNjZW5lKS5nZXRDb21wb25lbnQoU2hvcFZpZXcpITtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuc2F3QXRMb2FkLCAnYWQnKTtcblxuICAgICAgICBAY2NjbGFzcygnUG9wdXBTY29wZScpXG4gICAgICAgIGNsYXNzIFBvcHVwU2NvcGUgZXh0ZW5kcyBMaWZldGltZVNjb3BlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZCBjb25maWd1cmUoYjogQ29udGFpbmVyQnVpbGRlcikge1xuICAgICAgICAgICAgICAgIGIucmVnaXN0ZXJJbnN0YW5jZShuZXcgTGV2ZWwoMykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBvcHVwVGVtcGxhdGUgPSBuZXcgTm9kZSgnUG9wdXAnKTtcbiAgICAgICAgcG9wdXBUZW1wbGF0ZS5hZGRDb21wb25lbnQoUG9wdXBTY29wZSk7XG4gICAgICAgIGNvbnN0IGlubmVyID0gbmV3IE5vZGUoJ0lubmVyJyk7XG4gICAgICAgIGlubmVyLmFkZENvbXBvbmVudChTaG9wVmlldyk7XG4gICAgICAgIGlubmVyLnBhcmVudCA9IHBvcHVwVGVtcGxhdGU7XG4gICAgICAgIHBvcHVwVGVtcGxhdGUuZ2V0Q29tcG9uZW50KFBvcHVwU2NvcGUpIS5hdXRvSW5qZWN0Tm9kZXMgPSBbXTtcbiAgICAgICAgY29uc3QgcG9wdXBOb2RlID0gZ2FtZS5pbnN0YW50aWF0ZShuZXcgUHJlZmFiKHBvcHVwVGVtcGxhdGUpLCBzY2VuZSk7XG4gICAgICAgIGNvbnN0IHBvcHVwID0gcG9wdXBOb2RlLmdldENvbXBvbmVudChQb3B1cFNjb3BlKSE7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChwb3B1cC5jb250YWluZXIhLnBhcmVudCwgZ2FtZS5jb250YWluZXIsICdjaGlsZCBvZiB0aGUgaW5zdGFudGlhdGluZyBzY29wZScpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwocG9wdXAuY29udGFpbmVyIS5yZXNvbHZlKExldmVsKS5udW1iZXIsIDMpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwocG9wdXBOb2RlLmdldENoaWxkQnlOYW1lKCdJbm5lcicpIS5nZXRDb21wb25lbnQoU2hvcFZpZXcpIS5hZHMsIHVuZGVmaW5lZCwgJ2xlZnQgdG8gdGhlIHBvcHVwIHNjb3BlJyk7XG4gICAgICAgIHBvcHVwTm9kZS5kZXN0cm95KCk7XG4gICAgICAgIGFzc2VydC5vayhwb3B1cC5jb250YWluZXIgPT09IG51bGwgJiYgIUNvbnRhaW5lci5hbGwuaGFzKHBvcHVwLmNvbnRhaW5lciBhcyBhbnkpLCAnZGlzcG9zZWQgd2l0aCBpdHMgbm9kZScpO1xuICAgICAgICBhc3NlcnQub2socHJvamVjdC5jb250YWluZXIgJiYgIWdhbWUuY29udGFpbmVyIS5kaXNwb3NlZCk7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0ZXN0KCdjb21wb25lbnQgcmVnaXN0cmF0aW9uczogZXhpc3RpbmcsIGluIGhpZXJhcmNoeSwgb24gYSBuZXcgbm9kZSwgaW4gYSBuZXcgcHJlZmFiJywgKCkgPT4ge1xuICAgICAgICBAY2NjbGFzcygnSHVkJykgY2xhc3MgSHVkIGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAgICAgICAgIEBpbmplY3QoSUFkcykgYWRzITogSUFkcztcbiAgICAgICAgfVxuICAgICAgICBAY2NjbGFzcygnUGxheWVyJykgY2xhc3MgUGxheWVyIGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICAgICAgICAgIEBpbmplY3QoQXVkaW8pIGF1ZGlvITogQXVkaW87XG4gICAgICAgIH1cbiAgICAgICAgQGNjY2xhc3MoJ0VuZW15JykgY2xhc3MgRW5lbXkgZXh0ZW5kcyBDb21wb25lbnQge31cbiAgICAgICAgY29uc3QgZW5lbXlUZW1wbGF0ZSA9IG5ldyBOb2RlKCdFbmVteVByZWZhYicpO1xuICAgICAgICBlbmVteVRlbXBsYXRlLmFkZENvbXBvbmVudChFbmVteSk7XG5cbiAgICAgICAgQGNjY2xhc3MoJ0NvbXBTY29wZScpXG4gICAgICAgIGNsYXNzIENvbXBTY29wZSBleHRlbmRzIExpZmV0aW1lU2NvcGUge1xuICAgICAgICAgICAgaHVkOiBIdWQgfCBudWxsID0gbnVsbDtcbiAgICAgICAgICAgIHByb3RlY3RlZCBjb25maWd1cmUoYjogQ29udGFpbmVyQnVpbGRlcikge1xuICAgICAgICAgICAgICAgIGIucmVnaXN0ZXIoRmFrZUFkcywgTGlmZXRpbWUuU2luZ2xldG9uKS5hcyhJQWRzKTtcbiAgICAgICAgICAgICAgICBiLnJlZ2lzdGVyKEF1ZGlvLCBMaWZldGltZS5TaW5nbGV0b24pO1xuICAgICAgICAgICAgICAgIGIucmVnaXN0ZXJDb21wb25lbnQodGhpcy5odWQhKTtcbiAgICAgICAgICAgICAgICBiLnJlZ2lzdGVyQ29tcG9uZW50SW5IaWVyYXJjaHkoUGxheWVyKTtcbiAgICAgICAgICAgICAgICBiLnJlZ2lzdGVyQ29tcG9uZW50SW5OZXdQcmVmYWIobmV3IFByZWZhYihlbmVteVRlbXBsYXRlKSwgRW5lbXksIExpZmV0aW1lLlRyYW5zaWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2NlbmUgPSBuZXcgU2NlbmUoJ0NvbXBvbmVudHMnKTtcbiAgICAgICAgY29uc3QgaHVkID0gbmV3IE5vZGUoJ0h1ZCcpLmFkZENvbXBvbmVudChIdWQpO1xuICAgICAgICBodWQubm9kZS5wYXJlbnQgPSBzY2VuZTtcbiAgICAgICAgY29uc3QgcGxheWVyID0gbmV3IE5vZGUoJ1BsYXllcicpLmFkZENvbXBvbmVudChQbGF5ZXIpO1xuICAgICAgICBwbGF5ZXIubm9kZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgcGxheWVyLm5vZGUucGFyZW50ID0gc2NlbmU7XG4gICAgICAgIGNvbnN0IHMgPSBzY29wZShzY2VuZSwgQ29tcFNjb3BlLCAnU2NvcGUnLCAoeCkgPT4gKHguaHVkID0gaHVkKSk7XG4gICAgICAgIGRpcmVjdG9yLnJ1blNjZW5lKHNjZW5lKTtcbiAgICAgICAgY29uc3QgYyA9IHMuY29udGFpbmVyITtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKGMucmVzb2x2ZShIdWQpLCBodWQpO1xuICAgICAgICBhc3NlcnQub2soaHVkLmFkcyBpbnN0YW5jZW9mIEZha2VBZHMsICdyZWdpc3RlcmVkIGNvbXBvbmVudHMgYXJlIGluamVjdGVkJyk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChjLnJlc29sdmUoUGxheWVyKSwgcGxheWVyLCAnZm91bmQgb24gYW4gaW5hY3RpdmUgbm9kZScpO1xuICAgICAgICBhc3NlcnQub2socGxheWVyLmF1ZGlvIGluc3RhbmNlb2YgQXVkaW8pO1xuICAgICAgICBjb25zdCBlMSA9IGMucmVzb2x2ZShFbmVteSk7XG4gICAgICAgIGNvbnN0IGUyID0gYy5yZXNvbHZlKEVuZW15KTtcbiAgICAgICAgYXNzZXJ0Lm9rKGUxICE9PSBlMiAmJiBlMS5ub2RlLnBhcmVudCA9PT0gc2NlbmUsICd0cmFuc2llbnQgcHJlZmFiIGluc3RhbmNlcyB1bmRlciB0aGUgc2NlbmUnKTtcbiAgICAgICAgcy5ub2RlLmRlc3Ryb3koKTtcbiAgICAgICAgYXNzZXJ0Lm9rKGUxLm5vZGUuaXNWYWxpZCwgJ3RyYW5zaWVudCBpbnN0YW5jZXMgYXJlIG5vdCBvd25lZCcpO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGVzdCgnYSBuZXcgbm9kZSBjb21wb25lbnQgaXMgbWFkZSBvbiByZXNvbHZlIGFuZCBkZXN0cm95ZWQgd2l0aCB0aGUgc2NvcGUnLCAoKSA9PiB7XG4gICAgICAgIEBjY2NsYXNzKCdTcGF3bmVyJykgY2xhc3MgU3Bhd25lciBleHRlbmRzIENvbXBvbmVudCB7XG4gICAgICAgICAgICBAaW5qZWN0KElBZHMpIGFkcyE6IElBZHM7XG4gICAgICAgICAgICBsb2FkZWRXaXRoID0gJyc7XG4gICAgICAgICAgICBvbkxvYWQoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRXaXRoID0gdGhpcy5hZHM/LnNob3coKSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBAY2NjbGFzcygnU3Bhd25TY29wZScpXG4gICAgICAgIGNsYXNzIFNwYXduU2NvcGUgZXh0ZW5kcyBMaWZldGltZVNjb3BlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZCBjb25maWd1cmUoYjogQ29udGFpbmVyQnVpbGRlcikge1xuICAgICAgICAgICAgICAgIGIucmVnaXN0ZXIoRmFrZUFkcywgTGlmZXRpbWUuU2luZ2xldG9uKS5hcyhJQWRzKTtcbiAgICAgICAgICAgICAgICBiLnJlZ2lzdGVyQ29tcG9uZW50T25OZXdOb2RlKFNwYXduZXIsIExpZmV0aW1lLlNjb3BlZCwgJ1NwYXduZXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzY2VuZSA9IG5ldyBTY2VuZSgnTmV3Tm9kZScpO1xuICAgICAgICBjb25zdCBzID0gc2NvcGUoc2NlbmUsIFNwYXduU2NvcGUsICdTY29wZScpO1xuICAgICAgICBkaXJlY3Rvci5ydW5TY2VuZShzY2VuZSk7XG4gICAgICAgIGNvbnN0IHNwID0gcy5jb250YWluZXIhLnJlc29sdmUoU3Bhd25lcik7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChzcC5sb2FkZWRXaXRoLCAnYWQnLCAnaW5qZWN0ZWQgYmVmb3JlIG9uTG9hZCcpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoc3Aubm9kZS5wYXJlbnQsIHNjZW5lKTtcbiAgICAgICAgcy5ub2RlLmRlc3Ryb3koKTtcbiAgICAgICAgYXNzZXJ0Lm9rKCFzcC5ub2RlLmlzVmFsaWQsICdkZXN0cm95ZWQgd2l0aCB0aGUgc2NvcGUnKTtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRlc3QoJ2VucXVldWUoKSBnaXZlcyBkYXRhIHRvIHRoZSBuZXh0IHNjZW5lOyBjcmVhdGVDaGlsZCgpJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZSA9IG5ldyBTY2VuZSgnRW5xdWV1ZWQnKTtcbiAgICAgICAgY29uc3QgZ2FtZSA9IHNjb3BlKHNjZW5lLCBHYW1lU2NvcGUsICdHYW1lJyk7XG4gICAgICAgIGNvbnN0IGggPSBMaWZldGltZVNjb3BlLmVucXVldWUoKGIpID0+IGIucmVnaXN0ZXJJbnN0YW5jZShuZXcgTGV2ZWwoNykpKTtcbiAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUoc2NlbmUpO1xuICAgICAgICBoLmRpc3Bvc2UoKTtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKGdhbWUuY29udGFpbmVyIS5yZXNvbHZlKExldmVsKS5udW1iZXIsIDcpO1xuICAgICAgICBjb25zdCBjaGlsZCA9IGdhbWUuY3JlYXRlQ2hpbGQoKGIpID0+IGIucmVnaXN0ZXIoQXVkaW8sIExpZmV0aW1lLlNjb3BlZCkpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQuY29udGFpbmVyIS5wYXJlbnQsIGdhbWUuY29udGFpbmVyKTtcbiAgICAgICAgYXNzZXJ0Lm9rKGNoaWxkLmNvbnRhaW5lciEucmVzb2x2ZShBdWRpbykgaW5zdGFuY2VvZiBBdWRpbyk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5ub2RlLnBhcmVudCwgZ2FtZS5ub2RlKTtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRlc3QoJ2RpYWdub3N0aWNzOiBzY29wZXMsIHJlZ2lzdHJhdGlvbnMsIGRlcGVuZGVuY2llcyBhbmQgaW5zdGFuY2VzJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZSA9IG5ldyBTY2VuZSgnRGlhZycpO1xuICAgICAgICBzY29wZShzY2VuZSwgUHJvamVjdFNjb3BlLCAnUHJvamVjdCcpO1xuICAgICAgICBjb25zdCBnYW1lID0gc2NvcGUoc2NlbmUsIEdhbWVTY29wZSwgJ0dhbWUnLCAocykgPT4gKHMucGFyZW50UmVmZXJlbmNlID0gJ1Byb2plY3RTY29wZScpKTtcbiAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUoc2NlbmUpO1xuICAgICAgICBjb25zdCBvID0gZGlhZ25vc3RpY3NBbnN3ZXIoeyB3aGF0OiAnb3ZlcnZpZXcnIH0pO1xuICAgICAgICBjb25zdCBnID0gby5zY29wZXMuZmluZCgoczogYW55KSA9PiBzLmlkID09PSBnYW1lLmNvbnRhaW5lciEuaWQpO1xuICAgICAgICBjb25zdCBwID0gby5zY29wZXMuZmluZCgoczogYW55KSA9PiBzLnR5cGUgPT09ICdQcm9qZWN0U2NvcGUnKTtcbiAgICAgICAgYXNzZXJ0Lm9rKGcgJiYgcCAmJiBnLnBhcmVudCA9PT0gcC5pZCAmJiBnLm5vZGUgPT09ICdHYW1lJyk7XG4gICAgICAgIGNvbnN0IHNjID0gZGlhZ25vc3RpY3NBbnN3ZXIoeyB3aGF0OiAnc2NvcGUnLCBwYXJhbXM6IHsgaWQ6IGcuaWQgfSB9KTtcbiAgICAgICAgY29uc3QgYWRzID0gc2MuaXRlbXMuZmluZCgocjogYW55KSA9PiByLmNvbnRyYWN0cy5pbmNsdWRlcygnSUFkcycpKTtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKGFkcy5saWZldGltZSwgJ1NpbmdsZXRvbicpO1xuICAgICAgICBjb25zdCBwcmVzZW50ZXIgPSBzYy5pdGVtcy5maW5kKChyOiBhbnkpID0+IHIuZW50cnlQb2ludCk7XG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGRpYWdub3N0aWNzQW5zd2VyKHsgd2hhdDogJ3JlZ2lzdHJhdGlvbicsIHBhcmFtczogeyBzY29wZTogZy5pZCwgaWQ6IHByZXNlbnRlci5pZCB9IH0pO1xuICAgICAgICBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRldGFpbC5kZXBlbmRlbmNpZXMubWFwKChkOiBhbnkpID0+IFtkLnRva2VuLCBkLmZyb21dKSwgW1snSUFkcycsIGBGYWtlQWRzIMK3ICR7Zy5uYW1lfWBdXSk7XG4gICAgICAgIGNvbnN0IGFkc0RldGFpbCA9IGRpYWdub3N0aWNzQW5zd2VyKHsgd2hhdDogJ3JlZ2lzdHJhdGlvbicsIHBhcmFtczogeyBzY29wZTogZy5pZCwgaWQ6IGFkcy5pZCB9IH0pO1xuICAgICAgICBhc3NlcnQub2soYWRzRGV0YWlsLmRlcGVuZGVudHMuc29tZSgoZDogc3RyaW5nKSA9PiBkLnN0YXJ0c1dpdGgoJ1ByZXNlbnRlcicpKSk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChhZHNEZXRhaWwuaW5zdGFuY2VzWzBdLnR5cGUsICdGYWtlQWRzJyk7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0ZXN0KCd0aGUgcm9vdCBzY29wZTogcmVzb3VyY2VzL1Jvb3RMaWZldGltZVNjb3BlLCBiZWZvcmUgdGhlIHNjZW5lIHNjb3Blcywga2VwdCBhY3Jvc3Mgc2NlbmVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBAY2NjbGFzcygnUm9vdFNjb3BlJylcbiAgICAgICAgY2xhc3MgUm9vdFNjb3BlIGV4dGVuZHMgTGlmZXRpbWVTY29wZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWQgY29uZmlndXJlKGI6IENvbnRhaW5lckJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICBiLnJlZ2lzdGVyKEF1ZGlvLCBMaWZldGltZS5TaW5nbGV0b24pO1xuICAgICAgICAgICAgICAgIGIucmVnaXN0ZXIoRmFrZUFkcywgTGlmZXRpbWUuU2luZ2xldG9uKS5hcyhJQWRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCByb290VGVtcGxhdGUgPSBuZXcgTm9kZSgnUm9vdCcpO1xuICAgICAgICByb290VGVtcGxhdGUuYWRkQ29tcG9uZW50KFJvb3RTY29wZSk7XG4gICAgICAgIGFzc2V0TWFuYWdlci5yZXNvdXJjZXMgPSBuZXcgRmFrZUJ1bmRsZSh7IFJvb3RMaWZldGltZVNjb3BlOiBuZXcgUHJlZmFiKHJvb3RUZW1wbGF0ZSkgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NlbmUgPSBuZXcgU2NlbmUoJ0ZpcnN0Jyk7XG4gICAgICAgIGNvbnN0IHNob3AgPSBuZXcgTm9kZSgnU2hvcCcpLmFkZENvbXBvbmVudChTaG9wVmlldyk7XG4gICAgICAgIHNob3Aubm9kZS5wYXJlbnQgPSBzY2VuZTtcbiAgICAgICAgY29uc3QgcyA9IHNjb3BlKHNjZW5lLCBMaWZldGltZVNjb3BlLCAnU2NvcGUnLCAoeCkgPT4gKHguYXV0b0luamVjdE5vZGVzID0gW3Nob3Aubm9kZV0pKTtcbiAgICAgICAgY29uc3Qgd2FybiA9IGNvbnNvbGUud2FybjtcbiAgICAgICAgY29uc29sZS53YXJuID0gKCkgPT4gdW5kZWZpbmVkO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUoc2NlbmUpO1xuICAgICAgICAgICAgYXdhaXQgd2FpdCgyMCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4gPSB3YXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvb3QgPSBMaWZldGltZVNjb3BlLnJvb3QhO1xuICAgICAgICBhc3NlcnQub2socm9vdCAmJiByb290LmlzUm9vdCAmJiByb290LmNvbnRhaW5lciwgJ2xvYWRlZCBhbmQgYnVpbHQnKTtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKHMuY29udGFpbmVyIS5wYXJlbnQsIHJvb3QuY29udGFpbmVyLCAnc2NvcGVzIHdpdGhvdXQgYSBwYXJlbnQgdXNlIHRoZSByb290Jyk7XG4gICAgICAgIGFzc2VydC5vayhzaG9wLmF1ZGlvIGluc3RhbmNlb2YgQXVkaW8pO1xuICAgICAgICBjb25zdCBhdWRpbyA9IHJvb3QuY29udGFpbmVyIS5yZXNvbHZlKEF1ZGlvKTtcblxuICAgICAgICBjb25zdCBuZXh0ID0gbmV3IFNjZW5lKCdTZWNvbmQnKTtcbiAgICAgICAgY29uc3QgczIgPSBzY29wZShuZXh0LCBMaWZldGltZVNjb3BlLCAnU2NvcGUnKTtcbiAgICAgICAgZGlyZWN0b3IucnVuU2NlbmUobmV4dCk7XG4gICAgICAgIGFzc2VydC5zdHJpY3RFcXVhbChMaWZldGltZVNjb3BlLnJvb3QsIHJvb3QsICdrZXB0IGFjcm9zcyBzY2VuZXMnKTtcbiAgICAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKHJvb3Qubm9kZS5wYXJlbnQsIG5leHQpO1xuICAgICAgICBhc3NlcnQuc3RyaWN0RXF1YWwoczIuY29udGFpbmVyIS5yZXNvbHZlKEF1ZGlvKSwgYXVkaW8pO1xuICAgICAgICBhc3NlcnQub2soIWF1ZGlvLmRpc3Bvc2VkKTtcbiAgICB9KTtcblxuICAgIGRvbmUoKTtcbn0pKCk7XG4iXX0=