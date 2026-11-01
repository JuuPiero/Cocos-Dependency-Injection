/**
 * The container (VContainer's IObjectResolver): resolves registrations,
 * owns the instances it made and disposes them with its scope.
 *
 *     const audio = container.resolve(AudioService);
 *     const analytics = container.tryResolve(IAnalytics);   // undefined when not registered
 *     const plugins = container.resolveAll(IPlugin);
 *     container.inject(someObject);                          // fills its @inject members
 *     const enemy = container.instantiate(Enemy);            // an unregistered class, injected
 *     const child = container.createScope((b) => b.register(Level, Lifetime.Scoped));
 */
import { ContainerBuilder, Installer, Lifetime, Registration, setContainerFactory, tokensOf } from './builder';
import { EntryPoints } from './entry-points';
import { dependenciesOf, InjectionInfo, injectionInfo } from './inject';
import { Class, classNameOf, Dependency, Token, tokenName, tokenOf } from './token';

let nextContainerId = 1;
/** Registrations being created (a chain may cross scopes): circular dependency detection. */
const creating: Registration[] = [];

export class Container {
    /** Every live container (the Diagnostics window). */
    static readonly all = new Set<Container>();
    /** Record what inject() fills (Diagnostics); the Cocos layer turns it off in release builds. */
    static trackInjected = true;

    readonly id = nextContainerId++;
    readonly parent: Container | null;
    readonly children = new Set<Container>();
    readonly registrations: Registration[];
    /** The LifetimeScope that built it (Cocos), or null. */
    readonly scope: any;
    name: string;
    disposed = false;
    /** Objects filled by inject() (Diagnostics). */
    readonly injected: { name: string; path: string }[] = [];
    private readonly map = new Map<Token, Registration[]>();
    private readonly scoped = new Map<Registration, any>();
    private readonly owned: { reg: Registration; instance: any }[] = [];

    /** Use ContainerBuilder.build() or createScope(). */
    constructor(builder: ContainerBuilder) {
        if (builder.parent?.disposed) throw new Error(`[Injector] Can't make a child of the disposed scope "${builder.parent.name}".`);
        this.parent = builder.parent;
        this.name = builder.name;
        this.scope = builder.scope;
        this.registrations = builder.registrations.slice();
        for (const r of this.registrations) {
            for (const t of tokensOf(r)) {
                const list = this.map.get(t);
                if (list) list.push(r);
                else this.map.set(t, [r]);
            }
        }
        this.parent?.children.add(this);
        Container.all.add(this);
    }

    // ---------------------------------------------------------------- resolve

    resolve<T>(t: Token<T>): T {
        return this.get({ token: t, optional: false, all: false }, null);
    }

    /** undefined when nothing is registered for the token. */
    tryResolve<T>(t: Token<T>): T | undefined {
        return this.get({ token: t, optional: true, all: false }, null);
    }

    /** Every registration of the token in this scope and its parents (parents first). */
    resolveAll<T>(t: Token<T>): T[] {
        return this.get({ token: t, optional: false, all: true }, null);
    }

    /** Whether the token can be resolved here. */
    has(t: Token): boolean {
        return t === Container || !!this.find(t);
    }

    /** Fills the @inject fields and methods of an existing object. */
    inject<T extends object>(obj: T, path = ''): T {
        const info = injectionInfo(obj.constructor);
        if (!info.any) return obj;
        const name = classNameOf(obj.constructor);
        this.injectInto(obj, info, name, null);
        if (Container.trackInjected) this.injected.push({ name, path });
        return obj;
    }

    /** Constructs a class that isn't registered, with its dependencies (not owned: not disposed). */
    instantiate<T>(type: Class<T>): T;
    // Loose implementation signature: the Cocos layer adds instantiate(prefab, parent).
    instantiate(type: any, ..._rest: any[]): any {
        this.checkAlive();
        return this.construct(type, classNameOf(type), null);
    }

    /** A child scope (VContainer's CreateScope). Disposed with this one. */
    createScope(installer?: Installer, name?: string): Container {
        this.checkAlive();
        const b = new ContainerBuilder(this, name || `${this.name} (child)`);
        installer?.(b);
        return b.build();
    }

    /** Disposes child scopes, then the instances this scope made (reverse order). */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const child of Array.from(this.children)) child.dispose();
        EntryPoints.remove(this);
        for (let i = this.owned.length - 1; i >= 0; i--) {
            const { reg, instance } = this.owned[i];
            try {
                if (reg.release) reg.release(instance);
                else if (instance && typeof instance.dispose === 'function') instance.dispose();
            } catch (e) {
                console.error(`[Injector] disposing ${reg.name}:`, e);
            }
        }
        this.owned.length = 0;
        this.scoped.clear();
        for (const r of this.registrations) {
            if (r.kind !== 'instance') {
                r.instance = undefined;
                r.hasInstance = false;
            }
        }
        this.parent?.children.delete(this);
        Container.all.delete(this);
    }

    // ------------------------------------------------------------ diagnostics

    /** Where a token resolves from (this scope or a parent), or null. */
    find(t: Token): { reg: Registration; owner: Container } | null {
        for (let c: Container | null = this; c; c = c.parent) {
            const list = c.map.get(t);
            if (list && list.length) return { reg: list[list.length - 1], owner: c };
        }
        return null;
    }

    /** Instances this scope holds for a registration (singleton or scoped). */
    instancesOf(reg: Registration): any[] {
        return this.owned.filter((o) => o.reg === reg).map((o) => o.instance);
    }

    // --------------------------------------------------------------- internal

    /** @internal Resolves one dependency (`requester` names it in errors). */
    get(dep: Dependency, requester: string | null, overrides: Map<Token, any> | null = null): any {
        this.checkAlive();
        const t = tokenOf(dep);
        if (t === undefined || t === null) throw new Error(`[Injector] ${requester || 'resolve'}: the forward reference returned ${t}.`);
        if (overrides && overrides.has(t)) return overrides.get(t);
        if (dep.all) return this.collect(t).map(({ reg, owner }) => this.instanceOf(reg, owner));
        if (t === Container) return this;
        const found = this.find(t);
        if (!found) {
            if (dep.optional) return undefined;
            throw new Error(
                `[Injector] No registration for ${tokenName(t)}${requester ? `, needed by ${requester}` : ''}, ` +
                `in the scope "${this.name}"${this.parent ? ' or its parents' : ''}. Register it in configure().`,
            );
        }
        return this.instanceOf(found.reg, found.owner);
    }

    /** @internal The instance of one of this scope's registrations. */
    resolveRegistration(reg: Registration): any {
        this.checkAlive();
        return this.instanceOf(reg, this);
    }

    private collect(t: Token): { reg: Registration; owner: Container }[] {
        const out = this.parent ? this.parent.collect(t) : [];
        for (const reg of this.map.get(t) || []) out.push({ reg, owner: this });
        return out;
    }

    private instanceOf(reg: Registration, owner: Container): any {
        reg.resolveCount++;
        if (reg.hasInstance) return reg.instance;
        switch (reg.lifetime) {
            case Lifetime.Singleton: {
                // Made by its owner: a singleton never sees a child scope's registrations.
                const inst = owner.create(reg);
                reg.instance = inst;
                reg.hasInstance = true;
                owner.owned.push({ reg, instance: inst });
                return inst;
            }
            case Lifetime.Scoped: {
                if (this.scoped.has(reg)) return this.scoped.get(reg);
                const inst = this.create(reg);
                this.scoped.set(reg, inst);
                this.owned.push({ reg, instance: inst });
                return inst;
            }
            default:
                return this.create(reg);
        }
    }

    private create(reg: Registration): any {
        const at = creating.indexOf(reg);
        if (at >= 0) {
            const path = [...creating.slice(at), reg].map((r) => r.name).join(' → ');
            throw new Error(`[Injector] Circular dependency: ${path}.`);
        }
        creating.push(reg);
        try {
            const inst = reg.factory ? reg.factory(this) : this.construct(reg.type as Class, reg.name, reg.parameters);
            reg.instanceCount++;
            return inst;
        } finally {
            creating.pop();
        }
    }

    private construct<T>(type: Class<T>, name: string, overrides: Map<Token, any> | null): T {
        const info = injectionInfo(type);
        const args = (info.ctor || []).map((d, i) => this.get(d, `${name} (constructor parameter ${i + 1})`, overrides));
        const inst = new type(...args);
        this.injectInto(inst, info, name, overrides);
        return inst;
    }

    private injectInto(obj: any, info: InjectionInfo, name: string, overrides: Map<Token, any> | null): void {
        for (const f of info.fields) obj[f.key] = this.get(f.dep, `${name}.${f.key}`, overrides);
        for (const m of info.methods) {
            const args = m.deps.map((d, i) => this.get(d, `${name}.${m.key}() parameter ${i + 1}`, overrides));
            obj[m.key](...args);
        }
    }

    private checkAlive(): void {
        if (this.disposed) throw new Error(`[Injector] The scope "${this.name}" is disposed.`);
    }

    /** Missing registrations and dependency cycles of this scope's classes, all at once. */
    validate(): string[] {
        const errors: string[] = [];
        const resolvable = (reg: Registration, t: Token) => reg.parameters.has(t) || t === Container || !!this.find(t);
        for (const reg of this.registrations) {
            if (reg.kind !== 'type') continue;
            for (const { dep, point } of dependenciesOf(reg.type!)) {
                if (dep.optional || dep.all) continue;
                let t: Token | undefined;
                try {
                    t = tokenOf(dep);
                } catch (e) {
                    errors.push(`${reg.name}: the forward reference of the ${point} failed: ${(e as Error)?.message || e}`);
                    continue;
                }
                if (t === undefined || t === null) errors.push(`${reg.name}: the ${point} is ${t} (forward reference).`);
                else if (!resolvable(reg, t)) errors.push(`${reg.name} needs ${tokenName(t)} (${point}), which is not registered.`);
            }
        }
        // Cycles between classes (factories can't be followed).
        const state = new Map<Registration, 1 | 2>();
        const stack: Registration[] = [];
        const reported = new Set<string>();
        const visit = (reg: Registration, owner: Container) => {
            if (state.get(reg) === 2 || reg.kind !== 'type') return;
            if (state.get(reg) === 1) {
                const path = [...stack.slice(stack.indexOf(reg)), reg].map((r) => r.name).join(' → ');
                if (!reported.has(path)) {
                    reported.add(path);
                    errors.push(`Circular dependency: ${path}.`);
                }
                return;
            }
            state.set(reg, 1);
            stack.push(reg);
            for (const { dep } of dependenciesOf(reg.type!)) {
                if (dep.all) continue;
                let t: Token | undefined;
                try {
                    t = tokenOf(dep);
                } catch {
                    continue;
                }
                if (!t || reg.parameters.has(t)) continue;
                // Singletons resolve from their owner; the rest from this scope.
                const found = (reg.lifetime === Lifetime.Singleton ? owner : this).find(t);
                if (found) visit(found.reg, found.owner);
            }
            stack.pop();
            state.set(reg, 2);
        };
        for (const reg of this.registrations) visit(reg, this);
        return errors;
    }
}

function buildContainer(b: ContainerBuilder): Container {
    const c = new Container(b);
    try {
        const errors = c.validate();
        if (errors.length) {
            throw new Error(`[Injector] The scope "${c.name}" can't be built:\n  - ${errors.join('\n  - ')}`);
        }
        for (const fn of b.buildCallbacks) fn(c);
        const entries = c.registrations
            .filter((r) => r.entryPoint)
            .map((r) => ({ instance: c.resolveRegistration(r), name: r.name }));
        EntryPoints.add(c, entries, b.entryPointExceptionHandler);
    } catch (e) {
        c.dispose();
        throw e;
    }
    return c;
}

setContainerFactory(buildContainer);
