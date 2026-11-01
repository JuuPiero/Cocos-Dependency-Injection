/**
 * Injector Diagnostics (VContainer's Diagnostics window): the scopes of a
 * running game with their registrations; below, the selected registration's
 * dependencies, dependents and instances, or the selected scope's details.
 */
import { createApp } from 'vue';
import type { ClientInfo, DebugBridge } from './bridge';

export interface DiagnosticsApp {
    dispose(): void;
    debug(): any;
}

const TEMPLATE = /* html */ `
<div class="ij-root">
  <div class="ij-toolbar">
    <select class="ij-input ij-client" v-model.number="clientId" @change="onClientChange" :disabled="!clients.length" title="Running game">
      <option v-if="!clients.length" :value="0">No game running</option>
      <option v-for="c in clients" :key="c.id" :value="c.id">{{ clientLabel(c) }}</option>
    </select>
    <input class="ij-input ij-search" placeholder="Search types" v-model="search">
    <label class="ij-check" title="All registrations in one list, with their scope"><input type="checkbox" v-model="flatten" @change="save"> Flatten Hierarchy</label>
    <span class="ij-flex"></span>
    <span class="ij-stat" v-if="tree">{{ tree.scopes.length }} scopes · {{ registrationCount }} registrations · {{ tree.entryPoints }} entry points</span>
    <label class="ij-check" title="Accept games from other devices (a phone running a browser preview)"><input type="checkbox" :checked="lan" @change="setLan($event.target.checked)"> LAN</label>
  </div>

  <div class="ij-empty" v-if="!clientId">
    <div class="ij-empty-title">No running game</div>
    <div>Press Play in the editor or open a browser preview: debug builds of the game connect here by themselves.</div>
    <div class="ij-dim" v-if="server">{{ server.running ? 'Listening on ' + server.host + ':' + server.port : 'Diagnostics server not running: ' + server.error }}</div>
  </div>

  <template v-else>
    <div class="ij-body">
      <div class="ij-table">
        <div class="ij-row ij-head">
          <span class="ij-col-type">Type</span>
          <span class="ij-col-contracts">Contract Types</span>
          <span class="ij-col-life">Lifetime</span>
          <span class="ij-col-reg">Register</span>
          <span class="ij-col-scope" v-if="flatten">Scope</span>
          <span class="ij-col-num" title="Instances held by the scope">Instances</span>
          <span class="ij-col-num" title="Times resolved">Resolves</span>
        </div>
        <div v-if="!rows.length" class="ij-dim ij-pad">{{ tree ? (search ? 'Nothing matches.' : 'No scopes: add a LifetimeScope to the scene.') : 'Loading…' }}</div>
        <div v-for="r in rows" :key="r.key" class="ij-row" :class="{ scope: r.isScope, on: r.key === selected, entry: r.entryPoint }" @click="select(r)">
          <span class="ij-col-type" :style="{ paddingLeft: (6 + r.depth * 14) + 'px' }">
            <span class="ij-caret" v-if="r.isScope" @click.stop="toggle(r.scopeId)">{{ collapsed.has(r.scopeId) ? '▸' : '▾' }}</span>
            <span class="ij-icon" :class="r.isScope ? 'ij-icon-scope' : 'ij-icon-' + r.kind"></span>
            <span class="ij-name" :title="r.name">{{ r.name }}</span>
            <span class="ij-dim" v-if="r.isScope && r.node">{{ r.node }}</span>
            <span class="ij-badge" v-if="r.root">Root</span>
            <span class="ij-badge" v-if="r.entryPoint">Entry Point</span>
          </span>
          <span class="ij-col-contracts" :title="r.contracts">{{ r.contracts }}</span>
          <span class="ij-col-life">{{ r.lifetime }}</span>
          <span class="ij-col-reg">{{ r.register }}</span>
          <span class="ij-col-scope" v-if="flatten" :title="r.scopeName">{{ r.scopeName }}</span>
          <span class="ij-col-num">{{ r.instances }}</span>
          <span class="ij-col-num">{{ r.resolves }}</span>
        </div>
      </div>
    </div>
    <div class="ij-splitter" @mousedown="startResize" title="Drag to resize"></div>
    <div class="ij-detail" :style="{ height: detailHeight + 'px' }">
      <div v-if="!detail" class="ij-dim ij-pad">Select a registration or a scope.</div>

      <template v-else-if="detail.kindOf === 'registration'">
        <div class="ij-detail-head">
          <span class="ij-icon" :class="'ij-icon-' + detail.kind"></span>
          <span class="ij-detail-name">{{ detail.name }}</span>
          <span class="ij-dim">{{ detail.lifetime }} · {{ registerText(detail) }} · {{ detail.scope }}</span>
        </div>
        <div class="ij-columns">
          <div class="ij-section">
            <div class="ij-section-title">Dependencies</div>
            <div v-if="!detail.dependencies.length" class="ij-dim">None{{ detail.kind === 'factory' ? ' known (a factory resolves what it needs itself)' : '' }}</div>
            <div v-for="d in detail.dependencies" :key="d.point" class="ij-line">
              <span class="ij-token">{{ d.all ? d.token + '[]' : d.token }}</span>
              <span class="ij-dim">{{ d.point }}{{ d.optional ? ', optional' : '' }}</span>
              <span class="ij-from" :class="{ missing: !d.from && !d.optional && !d.all }">{{ d.from ? '← ' + d.from : (d.optional || d.all ? '' : 'not registered') }}</span>
            </div>
            <div class="ij-section-title">Injected Into</div>
            <div v-if="!detail.dependents.length" class="ij-dim">Nothing registered asks for it.</div>
            <div v-for="d in detail.dependents" :key="d" class="ij-line">{{ d }}</div>
          </div>
          <div class="ij-section">
            <div class="ij-section-title">Instances <span class="ij-dim">({{ detail.instances.length }}{{ detail.lifetime === 'Transient' ? ', transient ones are not kept' : '' }})</span></div>
            <div v-for="(inst, i) in detail.instances" :key="i" class="ij-instance">
              <div class="ij-instance-head">{{ refText(inst) }}</div>
              <div v-if="inst && inst.fields" class="ij-fields">
                <div v-for="(v, k) in inst.fields" :key="k" class="ij-field">
                  <span class="ij-field-name">{{ k }}</span><span class="ij-field-value" :title="refText(v)">{{ refText(v) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="ij-detail-head">
          <span class="ij-icon ij-icon-scope"></span>
          <span class="ij-detail-name">{{ detail.name }}</span>
          <span class="ij-dim">{{ detail.type }}{{ detail.node ? ' on ' + detail.node : '' }} · parent: {{ detail.parentName || 'none' }}</span>
        </div>
        <div class="ij-columns">
          <div class="ij-section">
            <div class="ij-section-title">Entry Points</div>
            <div v-if="!entryPoints.length" class="ij-dim">None.</div>
            <div v-for="e in entryPoints" :key="e.id" class="ij-line">{{ e.name }}</div>
          </div>
          <div class="ij-section">
            <div class="ij-section-title">Injected Objects <span class="ij-dim">({{ detail.injected.length }})</span></div>
            <div v-if="!detail.injected.length" class="ij-dim">Nothing yet: components of Auto Inject Nodes and instantiate() show here.</div>
            <div v-for="(o, i) in detail.injected" :key="i" class="ij-line"><span>{{ o.name }}</span><span class="ij-dim">{{ o.path }}</span></div>
          </div>
        </div>
      </template>
    </div>
  </template>
</div>
`;

const REGISTER: Record<string, string> = {
    type: 'Register',
    instance: 'RegisterInstance',
    factory: 'RegisterFactory',
    component: 'RegisterComponent',
};

export function createDiagnosticsApp(el: HTMLElement, bridge: DebugBridge): DiagnosticsApp {
    let vm: any = null;
    let timer: any = null;
    let tick = 0;
    let busy = false;
    let off: (() => void) | null = null;

    const app = createApp({
        template: TEMPLATE,
        data() {
            return {
                clients: [] as ClientInfo[],
                clientId: 0,
                server: null as any,
                lan: false,
                tree: null as any,
                search: '',
                flatten: false,
                collapsed: new Set<number>(),
                selected: '',
                detail: null as any,
                detailHeight: 220,
            };
        },
        computed: {
            registrationCount(this: any) {
                return (this.tree?.scopes || []).reduce((n: number, s: any) => n + s.items.length, 0);
            },
            rows(this: any) {
                const scopes: any[] = this.tree?.scopes || [];
                const q = this.search.trim().toLowerCase();
                const match = (r: any) => !q || r.name.toLowerCase().includes(q) || r.contracts.some((c: string) => c.toLowerCase().includes(q));
                const regRow = (s: any, r: any, depth: number) => ({
                    key: `r:${s.id}:${r.id}`,
                    isScope: false,
                    scopeId: s.id,
                    scopeName: s.name,
                    id: r.id,
                    depth,
                    name: r.name,
                    kind: r.entryPoint ? 'entry' : r.kind,
                    entryPoint: r.entryPoint,
                    contracts: r.contracts.join(', '),
                    lifetime: r.lifetime,
                    register: this.registerText(r),
                    instances: r.instances,
                    resolves: r.resolves,
                });
                if (this.flatten) {
                    const out: any[] = [];
                    for (const s of scopes) for (const r of s.items) if (match(r)) out.push(regRow(s, r, 0));
                    return out;
                }
                const children = new Map<number, any[]>();
                const ids = new Set(scopes.map((s) => s.id));
                for (const s of scopes) {
                    const p = ids.has(s.parent) ? s.parent : 0;
                    (children.get(p) || children.set(p, []).get(p)!).push(s);
                }
                const out: any[] = [];
                const visit = (s: any, depth: number): boolean => {
                    const mine = s.items.filter(match);
                    const start = out.length;
                    out.push({
                        key: `s:${s.id}`, isScope: true, scopeId: s.id, depth, name: s.name, node: s.node, root: s.root,
                        contracts: '', lifetime: '', register: '', instances: '', resolves: '',
                    });
                    let any = mine.length > 0;
                    const open = !this.collapsed.has(s.id);
                    if (open) for (const r of mine) out.push(regRow(s, r, depth + 1));
                    for (const ch of children.get(s.id) || []) {
                        if (open) any = visit(ch, depth + 1) || any;
                        else any = true;
                    }
                    if (q && !any) out.length = start;
                    return any;
                };
                for (const s of children.get(0) || []) visit(s, 0);
                return out;
            },
            entryPoints(this: any) {
                return (this.detail?.items || []).filter((r: any) => r.entryPoint);
            },
        },
        methods: {
            clientLabel(c: ClientInfo) {
                let where = '';
                try {
                    where = c.url ? new URL(c.url).host : '';
                } catch {
                    where = '';
                }
                return `${c.runtime}${where ? ' – ' + where : ''}`;
            },
            registerText(r: any) {
                return r.entryPoint ? 'RegisterEntryPoint' : REGISTER[r.kind] || r.kind;
            },
            refText(v: any): string {
                if (v === null || v === undefined) return 'None';
                if (typeof v !== 'object') return typeof v === 'string' ? JSON.stringify(v) : String(v);
                switch (v.kind) {
                    case 'asset': return `${v.type.replace(/^cc\./, '')} "${v.name}"`;
                    case 'node': return `Node "${v.name}"${v.valid === false ? ' (destroyed)' : ''}`;
                    case 'component': return `${v.type} on ${v.node}${v.valid === false ? ' (destroyed)' : ''}`;
                    case 'array': return `Array(${v.length})`;
                    case 'function': return v.type === 'function' ? 'function' : `class ${v.type}`;
                    default: return v.type || 'Object';
                }
            },
            toggle(id: number) {
                const s = new Set(this.collapsed);
                if (s.has(id)) s.delete(id);
                else s.add(id);
                this.collapsed = s;
            },
            select(r: any) {
                this.selected = r.key;
                this.detail = null;
                pollDetail();
            },
            onClientChange() {
                this.tree = null;
                this.detail = null;
                poll(true);
            },
            async setLan(on: boolean) {
                const s = await bridge.setLan(on).catch(() => null);
                if (s) this.server = s;
                this.lan = on;
            },
            startResize(ev: MouseEvent) {
                const startY = ev.clientY;
                const startH = this.detailHeight;
                const move = (e: MouseEvent) => {
                    this.detailHeight = Math.max(80, Math.min(window.innerHeight - 120, startH - (e.clientY - startY)));
                };
                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                    this.save();
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            },
            save() {
                bridge.saveSettings({ flatten: this.flatten, detailHeight: this.detailHeight });
            },
        },
        created(this: any) {
            vm = this;
        },
    });

    async function refreshStatus(): Promise<void> {
        const s = await bridge.status().catch(() => null);
        if (!s || !vm) return;
        vm.server = s;
        vm.lan = s.host === '0.0.0.0';
        setClients(s.clients);
    }

    function setClients(clients: ClientInfo[]): void {
        vm.clients = clients;
        if (!clients.some((c) => c.id === vm.clientId)) {
            vm.clientId = clients.length ? clients[clients.length - 1].id : 0;
            vm.tree = null;
            vm.detail = null;
        }
    }

    async function pollDetail(): Promise<void> {
        const key: string = vm?.selected || '';
        if (!vm || !vm.clientId || !key) return;
        const parts = key.split(':');
        const d = parts[0] === 'r'
            ? await bridge.request(vm.clientId, 'registration', { scope: +parts[1], id: +parts[2] })
            : await bridge.request(vm.clientId, 'scope', { id: +parts[1] });
        if (!vm || vm.selected !== key) return;
        vm.detail = d && !d.error ? { ...d, kindOf: parts[0] === 'r' ? 'registration' : 'scope' } : null;
    }

    async function poll(force = false): Promise<void> {
        if (!vm || (busy && !force)) return;
        busy = true;
        try {
            if (!vm.clientId) {
                if (force || tick % 4 === 0) await refreshStatus();
                return;
            }
            const t = await bridge.request(vm.clientId, 'tree');
            if (!vm) return;
            if (t && !t.error) vm.tree = t;
            else if (!force) await refreshStatus();
            await pollDetail();
        } finally {
            busy = false;
        }
    }

    app.mount(el);
    off = bridge.onClients((clients) => vm && setClients(clients));
    bridge.loadSettings().then((s) => {
        if (!s || !vm) return;
        if (typeof s.flatten === 'boolean') vm.flatten = s.flatten;
        if (typeof s.detailHeight === 'number') vm.detailHeight = s.detailHeight;
    });
    refreshStatus().then(() => poll(true));
    timer = setInterval(() => {
        tick++;
        if (typeof document !== 'undefined' && document.hidden) return;
        poll();
    }, 500);

    return {
        dispose() {
            clearInterval(timer);
            off?.();
            app.unmount();
            vm = null;
        },
        debug: () => ({ vm, poll }),
    };
}
