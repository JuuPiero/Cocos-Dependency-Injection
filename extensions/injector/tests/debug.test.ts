/** The Diagnostics bridge: the editor's server, a game connecting to it, the agent's answers. */
import assert from 'assert';
import { ContainerBuilder, Lifetime, diagnosticsAnswer, inject } from '../assets';
import { DebugServer } from '../source/debug-server';
import { done, test } from './harness';

class Config {
    volume = 0.5;
    name = 'default';
}

@inject(Config)
class Sound {
    constructor(readonly config: Config) {}
}

(async () => {
    const b = new ContainerBuilder(null, 'Bridge Test');
    b.registerInstance(new Config());
    b.register(Sound, Lifetime.Singleton);
    const c = b.build();
    c.resolve(Sound);

    await test('the tree lists scopes with their registrations', () => {
        const t = diagnosticsAnswer({ what: 'tree' });
        const s = t.scopes.find((x: any) => x.id === c.id);
        assert.ok(s && s.type === 'Container' && s.items.length === 2);
        const sound = s.items.find((r: any) => r.name === 'Sound');
        assert.deepStrictEqual([sound.lifetime, sound.instances, sound.resolves], ['Singleton', 1, 1]);
        const config = s.items.find((r: any) => r.name === 'Config');
        assert.strictEqual(config.lifetime, 'Instance');
    });

    await test('a registration shows its dependencies and its instance fields', () => {
        const s = diagnosticsAnswer({ what: 'tree' }).scopes.find((x: any) => x.id === c.id);
        const sound = s.items.find((r: any) => r.name === 'Sound');
        const d = diagnosticsAnswer({ what: 'registration', params: { scope: c.id, id: sound.id } });
        assert.deepStrictEqual(d.dependencies, [{ point: 'constructor parameter 1', token: 'Config', optional: false, all: false, from: 'Config · Bridge Test' }]);
        assert.strictEqual(d.instances[0].type, 'Sound');
        assert.strictEqual(d.instances[0].fields.config.type, 'Config');
        assert.strictEqual(diagnosticsAnswer({ what: 'nope' }).error, 'unknown request nope');
    });

    await test('diagnostics server: a game connects, the editor asks, the game answers', async () => {
        const changes: number[] = [];
        const server = new DebugServer(() => changes.push(server.list().length));
        await server.start(false);
        assert.ok(server.running, server.error);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebSocket } = require('ws');
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/injector`);
        await new Promise((r) => ws.once('open', r));
        ws.send(JSON.stringify({ type: 'hello', runtime: 'Test Game', url: 'http://localhost:7456/' }));
        ws.on('message', (raw: any) => {
            const req = JSON.parse(String(raw));
            ws.send(JSON.stringify({ type: 'reply', id: req.id, data: diagnosticsAnswer(req) }));
        });
        for (let i = 0; i < 50 && !server.list().length; i++) await new Promise((r) => setTimeout(r, 10));
        const [client] = server.list();
        assert.strictEqual(client.runtime, 'Test Game');
        const t = await server.request(client.id, 'tree', {});
        assert.ok(t.scopes.some((s: any) => s.name === 'Bridge Test'));
        ws.close();
        for (let i = 0; i < 50 && server.list().length; i++) await new Promise((r) => setTimeout(r, 10));
        assert.strictEqual(server.list().length, 0);
        assert.strictEqual(await server.request(client.id, 'tree', {}), null, 'gone clients answer null');
        await server.stop();
        assert.ok(changes.length >= 2);
    });

    c.dispose();
    done();
})();
