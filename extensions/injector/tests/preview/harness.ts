/**
 * The Diagnostics window against real scopes in the page (fake engine): a
 * root scope, a scene scope with entry points, a popup child scope. With
 * #interact it clicks through the window and writes the results into #result.
 */
import type * as CC from 'cc';
import * as fake from '../stubs/fake-cc';
import { Container, ContainerBuilder, Lifetime, LifetimeScope, all, diagnosticsAnswer, inject, optional, token } from '../../assets';
import { createDiagnosticsApp } from '../../source/panels/default/app';
import type { DebugBridge } from '../../source/panels/default/bridge';

const { _decorator, Component, Node, Scene } = fake as unknown as typeof CC;
const { ccclass } = _decorator;

abstract class IAds { abstract show(): void; }
abstract class IAnalytics { abstract track(e: string): void; }
abstract class IShopItem { abstract readonly id: string; }

class SaveService { slot = 1; data: Record<string, number> = { coins: 120, level: 4 }; }
class AudioService { volume = 0.8; muted = false; }
class FakeAds extends IAds { shown = 0; show() { this.shown++; } }
class ConsoleAnalytics extends IAnalytics { events: string[] = []; track(e: string) { this.events.push(e); } }
class GameConfig { gravity = -9.8; title = 'Bus Go'; }
const LevelNumber = token<number>('LevelNumber');
class CoinPack extends IShopItem { id = 'coins'; }
class NoAds extends IShopItem { id = 'no-ads'; }

@inject(IAds, SaveService, all(IShopItem), optional(IAnalytics))
class ShopPresenter {
    constructor(readonly ads: IAds, readonly save: SaveService, readonly items: IShopItem[], readonly analytics?: IAnalytics) {}
    start() {}
    tick() {}
}

@inject(LevelNumber, GameConfig, AudioService)
class GamePresenter {
    constructor(readonly level: number, readonly config: GameConfig, readonly audio: AudioService) {}
    initialize() {}
}

@ccclass('ShopView')
class ShopView extends Component {
    @inject(IAds) ads!: IAds;
}

@ccclass('ProjectLifetimeScope')
class ProjectLifetimeScope extends LifetimeScope {
    protected configure(b: ContainerBuilder) {
        b.register(SaveService, Lifetime.Singleton);
        b.register(AudioService, Lifetime.Singleton);
        b.register(ConsoleAnalytics, Lifetime.Singleton).as(IAnalytics);
    }
}

@ccclass('GameLifetimeScope')
class GameLifetimeScope extends LifetimeScope {
    protected configure(b: ContainerBuilder) {
        b.register(FakeAds, Lifetime.Singleton).as(IAds);
        b.registerInstance(new GameConfig());
        b.registerInstance(4).as(LevelNumber);
        b.register(CoinPack, Lifetime.Transient).as(IShopItem);
        b.register(NoAds, Lifetime.Transient).as(IShopItem);
        b.registerFactory(token<() => number>('Random'), () => () => Math.random(), Lifetime.Scoped);
        b.registerEntryPoint(GamePresenter);
        b.registerEntryPoint(ShopPresenter);
    }
}

// A debug build records what it injects (the page runs with DEBUG off).
Container.trackInjected = true;
const scene = new Scene('Main');
const project = new Node('Project').addComponent(ProjectLifetimeScope);
project.node.parent = scene;
const canvas = new Node('Canvas');
canvas.parent = scene;
for (const name of ['Shop', 'Shop Header', 'Shop Footer']) new Node(name).addComponent(ShopView).node.parent = canvas;
const game = new Node('GameScope').addComponent(GameLifetimeScope);
game.parentReference = 'ProjectLifetimeScope';
game.autoInjectNodes = [canvas];
game.node.parent = scene;
fake.director.runScene(scene as any);
const popup = game.createChild((b) => b.register(SaveService, Lifetime.Scoped), 'Popup');
popup.container!.resolve(SaveService);
setInterval(() => fake.director.tick(), 16);

const bridge: DebugBridge = {
    status: async () => ({ clients: [{ id: 1, runtime: 'Play in Editor', url: 'http://localhost:7456/', agent: '', since: 0 }], port: 7471, host: '127.0.0.1', error: '', running: true }),
    request: async (_id, what, params) => diagnosticsAnswer({ what, params }),
    onClients: () => () => undefined,
    setLan: async () => ({ clients: [], port: 7471, host: '0.0.0.0', error: '', running: true }),
    loadSettings: async () => null,
    saveSettings: () => undefined,
};

const ui = createDiagnosticsApp(document.getElementById('app')!, bridge);
(window as any).ui = ui;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $$ = (s: string) => Array.from(document.querySelectorAll(s)) as HTMLElement[];
const rowText = () => $$('.ij-row:not(.ij-head)').map((r) => r.textContent || '');

async function run() {
    const lines: string[] = [];
    const check = (name: string, ok: boolean, detail = '') => lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
    try {
        await wait(800);
        const { vm } = (ui as any).debug();
        check('connected to the game', vm.clientId === 1 && !!vm.tree);
        const scopes = $$('.ij-row.scope').map((r) => r.querySelector('.ij-name')?.textContent);
        check('scopes nest: project > game > popup', scopes.join(' > ') === 'ProjectLifetimeScope > GameLifetimeScope > LifetimeScope (Popup)', scopes.join(' > '));
        const shopRow = $$('.ij-row').find((r) => r.querySelector('.ij-name')?.textContent === 'ShopPresenter');
        check('registrations show contracts, lifetime and how they were registered',
            !!shopRow && shopRow.textContent!.includes('Singleton') && shopRow.textContent!.includes('RegisterEntryPoint'), shopRow?.textContent || '');
        const adsRow = $$('.ij-row').find((r) => r.querySelector('.ij-name')?.textContent === 'FakeAds')!;
        check('as() shows the contract types', adsRow.querySelector('.ij-col-contracts')?.textContent === 'IAds');

        shopRow!.click();
        await wait(400);
        const deps = $$('.ij-line').map((l) => l.textContent || '').join(' | ');
        check('dependencies say where they resolve from', deps.includes('IAds') && deps.includes('FakeAds · GameLifetimeScope') && deps.includes('SaveService · ProjectLifetimeScope'), deps);
        check('all() and optional() dependencies', deps.includes('IShopItem[]') && deps.includes('2 registrations') && deps.includes('optional'));
        const inst = $$('.ij-instance-head').map((e) => e.textContent).join(',');
        check('the instance and its fields', inst === 'ShopPresenter' && $$('.ij-field-name').some((f) => f.textContent === 'items'), inst);

        $$('.ij-row').find((r) => r.querySelector('.ij-name')?.textContent === 'FakeAds')!.click();
        await wait(400);
        const into = $$('.ij-line').map((l) => l.textContent || '').join(' | ');
        check('injected into: who asks for it', into.includes('ShopPresenter · GameLifetimeScope'), into);

        $$('.ij-row.scope').find((r) => r.textContent!.includes('GameLifetimeScope'))!.click();
        await wait(400);
        const injected = $$('.ij-line').map((l) => l.textContent || '').join(' | ');
        check('a scope lists its entry points and injected components', injected.includes('GamePresenter') && injected.includes('Canvas/Shop Header'), injected);

        vm.search = 'shop';
        await wait(100);
        const found = rowText().filter((t) => !t.includes('Scope'));
        check('search filters the types', found.length > 0 && found.every((t) => t.toLowerCase().includes('shop')), `${found.length} rows`);
        vm.search = '';
        vm.flatten = true;
        await wait(100);
        check('flatten hierarchy lists every registration with its scope', !$$('.ij-row.scope').length && $$('.ij-col-scope').length > 10);
        vm.flatten = false;
        await wait(100);

        $$('.ij-caret')[0].click();
        await wait(100);
        check('collapsing a scope hides its content', $$('.ij-row:not(.ij-head)').length === 1);
        $$('.ij-caret')[0].click();
        await wait(100);
        // Leave a registration selected for the screenshot.
        $$('.ij-row').find((r) => r.querySelector('.ij-name')?.textContent === 'ShopPresenter')!.click();
        await wait(500);
    } catch (e) {
        lines.push(`FAIL exception: ${(e as Error).stack || e}`);
    }
    const div = document.createElement('div');
    div.id = 'result';
    div.textContent = lines.join('\n');
    document.body.appendChild(div);
}

if (location.hash.includes('interact')) setTimeout(run, 300);
