/**
 * Diagnostics agent: lets the editor's Injector Diagnostics window look into
 * the running game's scopes (Play in Editor and browser previews). Debug
 * builds only. It connects to the extension's WebSocket server and answers
 * a fixed set of read-only requests: overview, tree, scope, registration.
 */
import { js } from 'cc';
import { DEBUG, EDITOR, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { Lifetime, Registration, tokensOf } from '../core/builder';
import { Container } from '../core/container';
import { EntryPoints } from '../core/entry-points';
import { dependenciesOf } from '../core/inject';
import { Token, tokenName, tokenOf } from '../core/token';
import { nodePath } from '../cocos/nodes';

/** Ports the editor tries (the first free one); the agent tries them in order. */
export const DIAGNOSTICS_PORTS = [7471, 7472, 7473];

const LIFETIMES: Record<number, string> = { [Lifetime.Singleton]: 'Singleton', [Lifetime.Scoped]: 'Scoped', [Lifetime.Transient]: 'Transient' };

function containers(): Container[] {
    return Array.from(Container.all).filter((c) => !c.disposed).sort((a, b) => a.id - b.id);
}

function scopeInfo(c: Container): any {
    const s = c.scope;
    return {
        id: c.id,
        name: c.name,
        type: s ? js.getClassName(s.constructor) || 'LifetimeScope' : 'Container',
        node: s?.node ? nodePath(s.node) : '',
        root: !!s?.isRoot,
        parent: c.parent && !c.parent.disposed ? c.parent.id : 0,
        registrations: c.registrations.length,
        entryPoints: c.registrations.filter((r) => r.entryPoint).length,
    };
}

function overview(): any {
    const list = containers();
    return {
        scopes: list.map(scopeInfo),
        entryPoints: EntryPoints.all.length,
    };
}

/** Every scope with its registrations (the window's main table). */
function tree(): any {
    const list = containers();
    return {
        scopes: list.map((c) => ({ ...scopeInfo(c), items: c.registrations.map((r) => regInfo(c, r)) })),
        entryPoints: EntryPoints.all.length,
    };
}

function regInfo(c: Container, r: Registration): any {
    return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        lifetime: r.kind === 'instance' ? 'Instance' : LIFETIMES[r.lifetime] || String(r.lifetime),
        contracts: tokensOf(r).map((t) => tokenName(t)),
        entryPoint: r.entryPoint,
        // Instances this scope holds; a given instance counts as one.
        instances: r.kind === 'instance' ? 1 : c.instancesOf(r).length,
        created: r.instanceCount,
        resolves: r.resolveCount,
    };
}

function scope(params: any): any {
    const c = containers().find((x) => x.id === (params?.id | 0));
    if (!c) return null;
    return {
        ...scopeInfo(c),
        parentName: c.parent?.name || '',
        items: c.registrations.map((r) => regInfo(c, r)),
        injected: c.injected.slice(-500),
    };
}

/** Readable stand-in for a JS value (assets, nodes, arrays, objects). */
function summarize(v: any, depth = 0): any {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'function') return { kind: 'function', type: v.prototype ? js.getClassName(v) || v.name || 'class' : 'function' };
    if (Array.isArray(v)) {
        return { kind: 'array', length: v.length, items: depth > 1 ? [] : v.slice(0, 20).map((x) => summarize(x, depth + 1)) };
    }
    const cls = js.getClassName(v) || v.constructor?.name || 'Object';
    if (v instanceof Container) return { kind: 'object', type: `Container "${v.name}"` };
    if (v._uuid !== undefined && typeof v.name === 'string' && !v.node) return { kind: 'asset', type: cls, name: v.name };
    if (v.node && typeof v.node.name === 'string' && v.uuid !== undefined) return { kind: 'component', type: cls, node: nodePath(v.node) || v.node.name, valid: v.isValid };
    if (typeof v.uuid === 'string' && Array.isArray(v.children) && typeof v.name === 'string') return { kind: 'node', type: 'Node', name: v.name, valid: v.isValid };
    if (depth > 1) return { kind: 'object', type: cls };
    const fields: Record<string, any> = {};
    for (const k of Object.keys(v).slice(0, 30)) fields[k] = summarize(v[k], depth + 1);
    return { kind: 'object', type: cls, fields };
}

function registration(params: any): any {
    const c = containers().find((x) => x.id === (params?.scope | 0));
    const r = c?.registrations.find((x) => x.id === (params?.id | 0));
    if (!c || !r) return null;
    const dependencies = r.kind === 'type' && r.type
        ? dependenciesOf(r.type).map(({ dep, point }) => {
            let t: Token | undefined;
            try {
                t = tokenOf(dep);
            } catch {
                t = undefined;
            }
            const given = !!t && r.parameters.has(t);
            const found = t && !given && !dep.all ? c.find(t) : null;
            let from = given ? 'withParameter' : t === Container ? 'the container' : found ? `${found.reg.name} · ${found.owner.name}` : '';
            if (t && dep.all) {
                let n = 0;
                for (let x: Container | null = c; x; x = x.parent) n += x.registrations.filter((o) => tokensOf(o).includes(t!)).length;
                from = `${n} registration${n === 1 ? '' : 's'}`;
            }
            return { point, token: tokenName(t), optional: dep.optional, all: dep.all, from };
        })
        : [];
    // Who asks for one of its tokens: this scope, its parents and its children.
    const mine = tokensOf(r);
    const related = new Set<Container>();
    for (let p: Container | null = c; p; p = p.parent) related.add(p);
    const addChildren = (x: Container) => x.children.forEach((ch) => {
        related.add(ch);
        addChildren(ch);
    });
    addChildren(c);
    const dependents: string[] = [];
    for (const x of related) {
        for (const other of x.registrations) {
            if (other === r || other.kind !== 'type' || !other.type) continue;
            const uses = dependenciesOf(other.type).some(({ dep }) => {
                try {
                    return mine.includes(tokenOf(dep));
                } catch {
                    return false;
                }
            });
            if (uses) dependents.push(`${other.name} · ${x.name}`);
        }
    }
    const instances = r.kind === 'instance' ? [r.instance] : c.instancesOf(r);
    return {
        ...regInfo(c, r),
        scope: c.name,
        dependencies,
        dependents,
        instances: instances.slice(0, 20).map((i) => summarize(i)),
    };
}

/** Answers one request of the Diagnostics window (also used directly by tests). */
export function diagnosticsAnswer(req: { what: string; params?: any }): any {
    try {
        switch (req.what) {
            case 'overview': return overview();
            case 'tree': return tree();
            case 'scope': return scope(req.params);
            case 'registration': return registration(req.params);
        }
        return { error: `unknown request ${req.what}` };
    } catch (e) {
        return { error: String((e as Error)?.message || e) };
    }
}

// --------------------------------------------------------------- connection

let socket: WebSocket | null = null;
let portIndex = 0;
let retryTimer: any = null;

/** Where the editor may be: the preview page's host (a phone on the LAN), then this machine. */
function hosts(): string[] {
    let h = '';
    try {
        h = (globalThis as any).location?.hostname || '';
    } catch {
        // no location (native)
    }
    return h && h !== '127.0.0.1' && h !== 'localhost' ? [h, '127.0.0.1'] : ['127.0.0.1'];
}

function connect(): void {
    if (typeof WebSocket === 'undefined') return;
    const list = hosts();
    const port = DIAGNOSTICS_PORTS[portIndex % DIAGNOSTICS_PORTS.length];
    const host = list[Math.floor(portIndex / DIAGNOSTICS_PORTS.length) % list.length];
    let ws: WebSocket;
    try {
        ws = new WebSocket(`ws://${host}:${port}/injector`);
    } catch {
        schedule();
        return;
    }
    let opened = false;
    ws.onopen = () => {
        opened = true;
        socket = ws;
        const loc = (globalThis as any).location;
        ws.send(JSON.stringify({
            type: 'hello',
            runtime: EDITOR ? 'Play in Editor' : 'Preview',
            url: loc ? String(loc.href) : '',
            agent: (globalThis as any).navigator?.userAgent || '',
        }));
    };
    ws.onmessage = (ev: MessageEvent) => {
        let req: any;
        try {
            req = JSON.parse(String(ev.data));
        } catch {
            return;
        }
        if (typeof req?.id !== 'number') return;
        ws.send(JSON.stringify({ type: 'reply', id: req.id, data: diagnosticsAnswer(req) }));
    };
    ws.onclose = () => {
        if (socket === ws) socket = null;
        if (!opened) portIndex++;
        schedule(opened ? 1000 : 3000);
    };
    ws.onerror = () => {
        // onclose follows
    };
}

function schedule(delay = 3000): void {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, delay);
}

/** True when the editor's Diagnostics window is connected. */
export function diagnosticsConnected(): boolean {
    return !!socket && socket.readyState === 1;
}

if (DEBUG && !EDITOR_NOT_IN_PREVIEW) setTimeout(connect, 500);
