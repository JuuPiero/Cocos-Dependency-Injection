"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Container = void 0;
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
const builder_1 = require("./builder");
const entry_points_1 = require("./entry-points");
const inject_1 = require("./inject");
const token_1 = require("./token");
let nextContainerId = 1;
/** Registrations being created (a chain may cross scopes): circular dependency detection. */
const creating = [];
class Container {
    /** Use ContainerBuilder.build() or createScope(). */
    constructor(builder) {
        var _a, _b;
        this.id = nextContainerId++;
        this.children = new Set();
        this.disposed = false;
        /** Objects filled by inject() (Diagnostics). */
        this.injected = [];
        this.map = new Map();
        this.scoped = new Map();
        this.owned = [];
        if ((_a = builder.parent) === null || _a === void 0 ? void 0 : _a.disposed)
            throw new Error(`[Injector] Can't make a child of the disposed scope "${builder.parent.name}".`);
        this.parent = builder.parent;
        this.name = builder.name;
        this.scope = builder.scope;
        this.registrations = builder.registrations.slice();
        for (const r of this.registrations) {
            for (const t of (0, builder_1.tokensOf)(r)) {
                const list = this.map.get(t);
                if (list)
                    list.push(r);
                else
                    this.map.set(t, [r]);
            }
        }
        (_b = this.parent) === null || _b === void 0 ? void 0 : _b.children.add(this);
        Container.all.add(this);
    }
    // ---------------------------------------------------------------- resolve
    resolve(t) {
        return this.get({ token: t, optional: false, all: false }, null);
    }
    /** undefined when nothing is registered for the token. */
    tryResolve(t) {
        return this.get({ token: t, optional: true, all: false }, null);
    }
    /** Every registration of the token in this scope and its parents (parents first). */
    resolveAll(t) {
        return this.get({ token: t, optional: false, all: true }, null);
    }
    /** Whether the token can be resolved here. */
    has(t) {
        return t === Container || !!this.find(t);
    }
    /** Fills the @inject fields and methods of an existing object. */
    inject(obj, path = '') {
        const info = (0, inject_1.injectionInfo)(obj.constructor);
        if (!info.any)
            return obj;
        const name = (0, token_1.classNameOf)(obj.constructor);
        this.injectInto(obj, info, name, null);
        if (Container.trackInjected)
            this.injected.push({ name, path });
        return obj;
    }
    /** Constructs a class that isn't registered, with its dependencies (not owned: not disposed). */
    instantiate(type) {
        this.checkAlive();
        return this.construct(type, (0, token_1.classNameOf)(type), null);
    }
    /** A child scope (VContainer's CreateScope). Disposed with this one. */
    createScope(installer, name) {
        this.checkAlive();
        const b = new builder_1.ContainerBuilder(this, name || `${this.name} (child)`);
        installer === null || installer === void 0 ? void 0 : installer(b);
        return b.build();
    }
    /** Disposes child scopes, then the instances this scope made (reverse order). */
    dispose() {
        var _a;
        if (this.disposed)
            return;
        this.disposed = true;
        for (const child of [...this.children])
            child.dispose();
        entry_points_1.EntryPoints.remove(this);
        for (let i = this.owned.length - 1; i >= 0; i--) {
            const { reg, instance } = this.owned[i];
            try {
                if (reg.release)
                    reg.release(instance);
                else if (instance && typeof instance.dispose === 'function')
                    instance.dispose();
            }
            catch (e) {
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
        (_a = this.parent) === null || _a === void 0 ? void 0 : _a.children.delete(this);
        Container.all.delete(this);
    }
    // ------------------------------------------------------------ diagnostics
    /** Where a token resolves from (this scope or a parent), or null. */
    find(t) {
        for (let c = this; c; c = c.parent) {
            const list = c.map.get(t);
            if (list && list.length)
                return { reg: list[list.length - 1], owner: c };
        }
        return null;
    }
    /** Instances this scope holds for a registration (singleton or scoped). */
    instancesOf(reg) {
        return this.owned.filter((o) => o.reg === reg).map((o) => o.instance);
    }
    // --------------------------------------------------------------- internal
    /** @internal Resolves one dependency (`requester` names it in errors). */
    get(dep, requester, overrides = null) {
        this.checkAlive();
        const t = (0, token_1.tokenOf)(dep);
        if (t === undefined || t === null)
            throw new Error(`[Injector] ${requester || 'resolve'}: the forward reference returned ${t}.`);
        if (overrides && overrides.has(t))
            return overrides.get(t);
        if (dep.all)
            return this.collect(t).map(({ reg, owner }) => this.instanceOf(reg, owner));
        if (t === Container)
            return this;
        const found = this.find(t);
        if (!found) {
            if (dep.optional)
                return undefined;
            throw new Error(`[Injector] No registration for ${(0, token_1.tokenName)(t)}${requester ? `, needed by ${requester}` : ''}, ` +
                `in the scope "${this.name}"${this.parent ? ' or its parents' : ''}. Register it in configure().`);
        }
        return this.instanceOf(found.reg, found.owner);
    }
    /** @internal The instance of one of this scope's registrations. */
    resolveRegistration(reg) {
        this.checkAlive();
        return this.instanceOf(reg, this);
    }
    collect(t) {
        const out = this.parent ? this.parent.collect(t) : [];
        for (const reg of this.map.get(t) || [])
            out.push({ reg, owner: this });
        return out;
    }
    instanceOf(reg, owner) {
        reg.resolveCount++;
        if (reg.hasInstance)
            return reg.instance;
        switch (reg.lifetime) {
            case builder_1.Lifetime.Singleton: {
                // Made by its owner: a singleton never sees a child scope's registrations.
                const inst = owner.create(reg);
                reg.instance = inst;
                reg.hasInstance = true;
                owner.owned.push({ reg, instance: inst });
                return inst;
            }
            case builder_1.Lifetime.Scoped: {
                if (this.scoped.has(reg))
                    return this.scoped.get(reg);
                const inst = this.create(reg);
                this.scoped.set(reg, inst);
                this.owned.push({ reg, instance: inst });
                return inst;
            }
            default:
                return this.create(reg);
        }
    }
    create(reg) {
        const at = creating.indexOf(reg);
        if (at >= 0) {
            const path = [...creating.slice(at), reg].map((r) => r.name).join(' → ');
            throw new Error(`[Injector] Circular dependency: ${path}.`);
        }
        creating.push(reg);
        try {
            const inst = reg.factory ? reg.factory(this) : this.construct(reg.type, reg.name, reg.parameters);
            reg.instanceCount++;
            return inst;
        }
        finally {
            creating.pop();
        }
    }
    construct(type, name, overrides) {
        const info = (0, inject_1.injectionInfo)(type);
        const args = (info.ctor || []).map((d, i) => this.get(d, `${name} (constructor parameter ${i + 1})`, overrides));
        const inst = new type(...args);
        this.injectInto(inst, info, name, overrides);
        return inst;
    }
    injectInto(obj, info, name, overrides) {
        for (const f of info.fields)
            obj[f.key] = this.get(f.dep, `${name}.${f.key}`, overrides);
        for (const m of info.methods) {
            const args = m.deps.map((d, i) => this.get(d, `${name}.${m.key}() parameter ${i + 1}`, overrides));
            obj[m.key](...args);
        }
    }
    checkAlive() {
        if (this.disposed)
            throw new Error(`[Injector] The scope "${this.name}" is disposed.`);
    }
    /** Missing registrations and dependency cycles of this scope's classes, all at once. */
    validate() {
        const errors = [];
        const resolvable = (reg, t) => reg.parameters.has(t) || t === Container || !!this.find(t);
        for (const reg of this.registrations) {
            if (reg.kind !== 'type')
                continue;
            for (const { dep, point } of (0, inject_1.dependenciesOf)(reg.type)) {
                if (dep.optional || dep.all)
                    continue;
                let t;
                try {
                    t = (0, token_1.tokenOf)(dep);
                }
                catch (e) {
                    errors.push(`${reg.name}: the forward reference of the ${point} failed: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
                    continue;
                }
                if (t === undefined || t === null)
                    errors.push(`${reg.name}: the ${point} is ${t} (forward reference).`);
                else if (!resolvable(reg, t))
                    errors.push(`${reg.name} needs ${(0, token_1.tokenName)(t)} (${point}), which is not registered.`);
            }
        }
        // Cycles between classes (factories can't be followed).
        const state = new Map();
        const stack = [];
        const reported = new Set();
        const visit = (reg, owner) => {
            if (state.get(reg) === 2 || reg.kind !== 'type')
                return;
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
            for (const { dep } of (0, inject_1.dependenciesOf)(reg.type)) {
                if (dep.all)
                    continue;
                let t;
                try {
                    t = (0, token_1.tokenOf)(dep);
                }
                catch (_a) {
                    continue;
                }
                if (!t || reg.parameters.has(t))
                    continue;
                // Singletons resolve from their owner; the rest from this scope.
                const found = (reg.lifetime === builder_1.Lifetime.Singleton ? owner : this).find(t);
                if (found)
                    visit(found.reg, found.owner);
            }
            stack.pop();
            state.set(reg, 2);
        };
        for (const reg of this.registrations)
            visit(reg, this);
        return errors;
    }
}
exports.Container = Container;
/** Every live container (the Diagnostics window). */
Container.all = new Set();
/** Record what inject() fills (Diagnostics); the Cocos layer turns it off in release builds. */
Container.trackInjected = true;
function buildContainer(b) {
    const c = new Container(b);
    try {
        const errors = c.validate();
        if (errors.length) {
            throw new Error(`[Injector] The scope "${c.name}" can't be built:\n  - ${errors.join('\n  - ')}`);
        }
        for (const fn of b.buildCallbacks)
            fn(c);
        const entries = c.registrations
            .filter((r) => r.entryPoint)
            .map((r) => ({ instance: c.resolveRegistration(r), name: r.name }));
        entry_points_1.EntryPoints.add(c, entries, b.entryPointExceptionHandler);
    }
    catch (e) {
        c.dispose();
        throw e;
    }
    return c;
}
(0, builder_1.setContainerFactory)(buildContainer);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGFpbmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29udGFpbmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7Ozs7Ozs7O0dBVUc7QUFDSCx1Q0FBK0c7QUFDL0csaURBQTZDO0FBQzdDLHFDQUF3RTtBQUN4RSxtQ0FBb0Y7QUFFcEYsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0FBQ3hCLDZGQUE2RjtBQUM3RixNQUFNLFFBQVEsR0FBbUIsRUFBRSxDQUFDO0FBRXBDLE1BQWEsU0FBUztJQW9CbEIscURBQXFEO0lBQ3JELFlBQVksT0FBeUI7O1FBZjVCLE9BQUUsR0FBRyxlQUFlLEVBQUUsQ0FBQztRQUV2QixhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQWEsQ0FBQztRQUt6QyxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLGdEQUFnRDtRQUN2QyxhQUFRLEdBQXFDLEVBQUUsQ0FBQztRQUN4QyxRQUFHLEdBQUcsSUFBSSxHQUFHLEVBQXlCLENBQUM7UUFDdkMsV0FBTSxHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO1FBQ3RDLFVBQUssR0FBMkMsRUFBRSxDQUFDO1FBSWhFLElBQUksTUFBQSxPQUFPLENBQUMsTUFBTSwwQ0FBRSxRQUFRO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyx3REFBd0QsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO1FBQy9ILElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUM3QixJQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzNCLElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNq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QUFDO1FBQ0QsS0FBSyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsY0FBYztZQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsYUFBYTthQUMxQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7YUFDM0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4RSwwQkFBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1QsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ1osTUFBTSxDQUFDLENBQUM7SUFDWixDQUFDO0lBQ0QsT0FBTyxDQUFDLENBQUM7QUFDYixDQUFDO0FBRUQsSUFBQSw2QkFBbUIsRUFBQyxjQUFjLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGhlIGNvbnRhaW5lciAoVkNvbnRhaW5lcidzIElPYmplY3RSZXNvbHZlcik6IHJlc29sdmVzIHJlZ2lzdHJhdGlvbnMsXG4gKiBvd25zIHRoZSBpbnN0YW5jZXMgaXQgbWFkZSBhbmQgZGlzcG9zZXMgdGhlbSB3aXRoIGl0cyBzY29wZS5cbiAqXG4gKiAgICAgY29uc3QgYXVkaW8gPSBjb250YWluZXIucmVzb2x2ZShBdWRpb1NlcnZpY2UpO1xuICogICAgIGNvbnN0IGFuYWx5dGljcyA9IGNvbnRhaW5lci50cnlSZXNvbHZlKElBbmFseXRpY3MpOyAgIC8vIHVuZGVmaW5lZCB3aGVuIG5vdCByZWdpc3RlcmVkXG4gKiAgICAgY29uc3QgcGx1Z2lucyA9IGNvbnRhaW5lci5yZXNvbHZlQWxsKElQbHVnaW4pO1xuICogICAgIGNvbnRhaW5lci5pbmplY3Qoc29tZU9iamVjdCk7ICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBmaWxscyBpdHMgQGluamVjdCBtZW1iZXJzXG4gKiAgICAgY29uc3QgZW5lbXkgPSBjb250YWluZXIuaW5zdGFudGlhdGUoRW5lbXkpOyAgICAgICAgICAgIC8vIGFuIHVucmVnaXN0ZXJlZCBjbGFzcywgaW5qZWN0ZWRcbiAqICAgICBjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5jcmVhdGVTY29wZSgoYikgPT4gYi5yZWdpc3RlcihMZXZlbCwgTGlmZXRpbWUuU2NvcGVkKSk7XG4gKi9cbmltcG9ydCB7IENvbnRhaW5lckJ1aWxkZXIsIEluc3RhbGxlciwgTGlmZXRpbWUsIFJlZ2lzdHJhdGlvbiwgc2V0Q29udGFpbmVyRmFjdG9yeSwgdG9rZW5zT2YgfSBmcm9tICcuL2J1aWxkZXInO1xuaW1wb3J0IHsgRW50cnlQb2ludHMgfSBmcm9tICcuL2VudHJ5LXBvaW50cyc7XG5pbXBvcnQgeyBkZXBlbmRlbmNpZXNPZiwgSW5qZWN0aW9uSW5mbywgaW5qZWN0aW9uSW5mbyB9IGZyb20gJy4vaW5qZWN0JztcbmltcG9ydCB7IENsYXNzLCBjbGFzc05hbWVPZiwgRGVwZW5kZW5jeSwgVG9rZW4sIHRva2VuTmFtZSwgdG9rZW5PZiB9IGZyb20gJy4vdG9rZW4nO1xuXG5sZXQgbmV4dENvbnRhaW5lcklkID0gMTtcbi8qKiBSZWdpc3RyYXRpb25zIGJlaW5nIGNyZWF0ZWQgKGEgY2hhaW4gbWF5IGNyb3NzIHNjb3Blcyk6IGNpcmN1bGFyIGRlcGVuZGVuY3kgZGV0ZWN0aW9uLiAqL1xuY29uc3QgY3JlYXRpbmc6IFJlZ2lzdHJhdGlvbltdID0gW107XG5cbmV4cG9ydCBjbGFzcyBDb250YWluZXIge1xuICAgIC8qKiBFdmVyeSBsaXZlIGNvbnRhaW5lciAodGhlIERpYWdub3N0aWNzIHdpbmRvdykuICovXG4gICAgc3RhdGljIHJlYWRvbmx5IGFsbCA9IG5ldyBTZXQ8Q29udGFpbmVyPigpO1xuICAgIC8qKiBSZWNvcmQgd2hhdCBpbmplY3QoKSBmaWxscyAoRGlhZ25vc3RpY3MpOyB0aGUgQ29jb3MgbGF5ZXIgdHVybnMgaXQgb2ZmIGluIHJlbGVhc2UgYnVpbGRzLiAqL1xuICAgIHN0YXRpYyB0cmFja0luamVjdGVkID0gdHJ1ZTtcblxuICAgIHJlYWRvbmx5IGlkID0gbmV4dENvbnRhaW5lcklkKys7XG4gICAgcmVhZG9ubHkgcGFyZW50OiBDb250YWluZXIgfCBudWxsO1xuICAgIHJlYWRvbmx5IGNoaWxkcmVuID0gbmV3IFNldDxDb250YWluZXI+KCk7XG4gICAgcmVhZG9ubHkgcmVnaXN0cmF0aW9uczogUmVnaXN0cmF0aW9uW107XG4gICAgLyoqIFRoZSBMaWZldGltZVNjb3BlIHRoYXQgYnVpbHQgaXQgKENvY29zKSwgb3IgbnVsbC4gKi9cbiAgICByZWFkb25seSBzY29wZTogYW55O1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkaXNwb3NlZCA9IGZhbHNlO1xuICAgIC8qKiBPYmplY3RzIGZpbGxlZCBieSBpbmplY3QoKSAoRGlhZ25vc3RpY3MpLiAqL1xuICAgIHJlYWRvbmx5IGluamVjdGVkOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nIH1bXSA9IFtdO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgbWFwID0gbmV3IE1hcDxUb2tlbiwgUmVnaXN0cmF0aW9uW10+KCk7XG4gICAgcHJpdmF0ZSByZWFkb25seSBzY29wZWQgPSBuZXcgTWFwPFJlZ2lzdHJhdGlvbiwgYW55PigpO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgb3duZWQ6IHsgcmVnOiBSZWdpc3RyYXRpb247IGluc3RhbmNlOiBhbnkgfVtdID0gW107XG5cbiAgICAvKiogVXNlIENvbnRhaW5lckJ1aWxkZXIuYnVpbGQoKSBvciBjcmVhdGVTY29wZSgpLiAqL1xuICAgIGNvbnN0cnVjdG9yKGJ1aWxkZXI6IENvbnRhaW5lckJ1aWxkZXIpIHtcbiAgICAgICAgaWYgKGJ1aWxkZXIucGFyZW50Py5kaXNwb3NlZCkgdGhyb3cgbmV3IEVycm9yKGBbSW5qZWN0b3JdIENhbid0IG1ha2UgYSBjaGlsZCBvZiB0aGUgZGlzcG9zZWQgc2NvcGUgXCIke2J1aWxkZXIucGFyZW50Lm5hbWV9XCIuYCk7XG4gICAgICAgIHRoaXMucGFyZW50ID0gYnVpbGRlci5wYXJlbnQ7XG4gICAgICAgIHRoaXMubmFtZSA9IGJ1aWxkZXIubmFtZTtcbiAgICAgICAgdGhpcy5zY29wZSA9IGJ1aWxkZXIuc2NvcGU7XG4gICAgICAgIHRoaXMucmVnaXN0cmF0aW9ucyA9IGJ1aWxkZXIucmVnaXN0cmF0aW9ucy5zbGljZSgpO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZWdpc3RyYXRpb25zKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdG9rZW5zT2YocikpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaXN0ID0gdGhpcy5tYXAuZ2V0KHQpO1xuICAgICAgICAgICAgICAgIGlmIChsaXN0KSBsaXN0LnB1c2gocik7XG4gICAgICAgICAgICAgICAgZWxzZSB0aGlzLm1hcC5zZXQodCwgW3JdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBhcmVudD8uY2hpbGRyZW4uYWRkKHRoaXMpO1xuICAgICAgICBDb250YWluZXIuYWxsLmFkZCh0aGlzKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHJlc29sdmVcblxuICAgIHJlc29sdmU8VD4odDogVG9rZW48VD4pOiBUIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KHsgdG9rZW46IHQsIG9wdGlvbmFsOiBmYWxzZSwgYWxsOiBmYWxzZSB9LCBudWxsKTtcbiAgICB9XG5cbiAgICAvKiogdW5kZWZpbmVkIHdoZW4gbm90aGluZyBpcyByZWdpc3RlcmVkIGZvciB0aGUgdG9rZW4uICovXG4gICAgdHJ5UmVzb2x2ZTxUPih0OiBUb2tlbjxUPik6IFQgfCB1bmRlZmluZWQge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXQoeyB0b2tlbjogdCwgb3B0aW9uYWw6IHRydWUsIGFsbDogZmFsc2UgfSwgbnVsbCk7XG4gICAgfVxuXG4gICAgLyoqIEV2ZXJ5IHJlZ2lzdHJhdGlvbiBvZiB0aGUgdG9rZW4gaW4gdGhpcyBzY29wZSBhbmQgaXRzIHBhcmVudHMgKHBhcmVudHMgZmlyc3QpLiAqL1xuICAgIHJlc29sdmVBbGw8VD4odDogVG9rZW48VD4pOiBUW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXQoeyB0b2tlbjogdCwgb3B0aW9uYWw6IGZhbHNlLCBhbGw6IHRydWUgfSwgbnVsbCk7XG4gICAgfVxuXG4gICAgLyoqIFdoZXRoZXIgdGhlIHRva2VuIGNhbiBiZSByZXNvbHZlZCBoZXJlLiAqL1xuICAgIGhhcyh0OiBUb2tlbik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdCA9PT0gQ29udGFpbmVyIHx8ICEhdGhpcy5maW5kKHQpO1xuICAgIH1cblxuICAgIC8qKiBGaWxscyB0aGUgQGluamVjdCBmaWVsZHMgYW5kIG1ldGhvZHMgb2YgYW4gZXhpc3Rpbmcgb2JqZWN0LiAqL1xuICAgIGluamVjdDxUIGV4dGVuZHMgb2JqZWN0PihvYmo6IFQsIHBhdGggPSAnJyk6IFQge1xuICAgICAgICBjb25zdCBpbmZvID0gaW5qZWN0aW9uSW5mbyhvYmouY29uc3RydWN0b3IpO1xuICAgICAgICBpZiAoIWluZm8uYW55KSByZXR1cm4gb2JqO1xuICAgICAgICBjb25zdCBuYW1lID0gY2xhc3NOYW1lT2Yob2JqLmNvbnN0cnVjdG9yKTtcbiAgICAgICAgdGhpcy5pbmplY3RJbnRvKG9iaiwgaW5mbywgbmFtZSwgbnVsbCk7XG4gICAgICAgIGlmIChDb250YWluZXIudHJhY2tJbmplY3RlZCkgdGhpcy5pbmplY3RlZC5wdXNoKHsgbmFtZSwgcGF0aCB9KTtcbiAgICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG5cbiAgICAvKiogQ29uc3RydWN0cyBhIGNsYXNzIHRoYXQgaXNuJ3QgcmVnaXN0ZXJlZCwgd2l0aCBpdHMgZGVwZW5kZW5jaWVzIChub3Qgb3duZWQ6IG5vdCBkaXNwb3NlZCkuICovXG4gICAgaW5zdGFudGlhdGU8VD4odHlwZTogQ2xhc3M8VD4pOiBUIHtcbiAgICAgICAgdGhpcy5jaGVja0FsaXZlKCk7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdCh0eXBlLCBjbGFzc05hbWVPZih0eXBlKSwgbnVsbCk7XG4gICAgfVxuXG4gICAgLyoqIEEgY2hpbGQgc2NvcGUgKFZDb250YWluZXIncyBDcmVhdGVTY29wZSkuIERpc3Bvc2VkIHdpdGggdGhpcyBvbmUuICovXG4gICAgY3JlYXRlU2NvcGUoaW5zdGFsbGVyPzogSW5zdGFsbGVyLCBuYW1lPzogc3RyaW5nKTogQ29udGFpbmVyIHtcbiAgICAgICAgdGhpcy5jaGVja0FsaXZlKCk7XG4gICAgICAgIGNvbnN0IGIgPSBuZXcgQ29udGFpbmVyQnVpbGRlcih0aGlzLCBuYW1lIHx8IGAke3RoaXMubmFtZX0gKGNoaWxkKWApO1xuICAgICAgICBpbnN0YWxsZXI/LihiKTtcbiAgICAgICAgcmV0dXJuIGIuYnVpbGQoKTtcbiAgICB9XG5cbiAgICAvKiogRGlzcG9zZXMgY2hpbGQgc2NvcGVzLCB0aGVuIHRoZSBpbnN0YW5jZXMgdGhpcyBzY29wZSBtYWRlIChyZXZlcnNlIG9yZGVyKS4gKi9cbiAgICBkaXNwb3NlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgICAgICB0aGlzLmRpc3Bvc2VkID0gdHJ1ZTtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4udGhpcy5jaGlsZHJlbl0pIGNoaWxkLmRpc3Bvc2UoKTtcbiAgICAgICAgRW50cnlQb2ludHMucmVtb3ZlKHRoaXMpO1xuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5vd25lZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgY29uc3QgeyByZWcsIGluc3RhbmNlIH0gPSB0aGlzLm93bmVkW2ldO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAocmVnLnJlbGVhc2UpIHJlZy5yZWxlYXNlKGluc3RhbmNlKTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpbnN0YW5jZSAmJiB0eXBlb2YgaW5zdGFuY2UuZGlzcG9zZSA9PT0gJ2Z1bmN0aW9uJykgaW5zdGFuY2UuZGlzcG9zZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtJbmplY3Rvcl0gZGlzcG9zaW5nICR7cmVnLm5hbWV9OmAsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMub3duZWQubGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy5zY29wZWQuY2xlYXIoKTtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIHRoaXMucmVnaXN0cmF0aW9ucykge1xuICAgICAgICAgICAgaWYgKHIua2luZCAhPT0gJ2luc3RhbmNlJykge1xuICAgICAgICAgICAgICAgIHIuaW5zdGFuY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgci5oYXNJbnN0YW5jZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMucGFyZW50Py5jaGlsZHJlbi5kZWxldGUodGhpcyk7XG4gICAgICAgIENvbnRhaW5lci5hbGwuZGVsZXRlKHRoaXMpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBkaWFnbm9zdGljc1xuXG4gICAgLyoqIFdoZXJlIGEgdG9rZW4gcmVzb2x2ZXMgZnJvbSAodGhpcyBzY29wZSBvciBhIHBhcmVudCksIG9yIG51bGwuICovXG4gICAgZmluZCh0OiBUb2tlbik6IHsgcmVnOiBSZWdpc3RyYXRpb247IG93bmVyOiBDb250YWluZXIgfSB8IG51bGwge1xuICAgICAgICBmb3IgKGxldCBjOiBDb250YWluZXIgfCBudWxsID0gdGhpczsgYzsgYyA9IGMucGFyZW50KSB7XG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gYy5tYXAuZ2V0KHQpO1xuICAgICAgICAgICAgaWYgKGxpc3QgJiYgbGlzdC5sZW5ndGgpIHJldHVybiB7IHJlZzogbGlzdFtsaXN0Lmxlbmd0aCAtIDFdLCBvd25lcjogYyB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKiBJbnN0YW5jZXMgdGhpcyBzY29wZSBob2xkcyBmb3IgYSByZWdpc3RyYXRpb24gKHNpbmdsZXRvbiBvciBzY29wZWQpLiAqL1xuICAgIGluc3RhbmNlc09mKHJlZzogUmVnaXN0cmF0aW9uKTogYW55W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5vd25lZC5maWx0ZXIoKG8pID0+IG8ucmVnID09PSByZWcpLm1hcCgobykgPT4gby5pbnN0YW5jZSk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGludGVybmFsXG5cbiAgICAvKiogQGludGVybmFsIFJlc29sdmVzIG9uZSBkZXBlbmRlbmN5IChgcmVxdWVzdGVyYCBuYW1lcyBpdCBpbiBlcnJvcnMpLiAqL1xuICAgIGdldChkZXA6IERlcGVuZGVuY3ksIHJlcXVlc3Rlcjogc3RyaW5nIHwgbnVsbCwgb3ZlcnJpZGVzOiBNYXA8VG9rZW4sIGFueT4gfCBudWxsID0gbnVsbCk6IGFueSB7XG4gICAgICAgIHRoaXMuY2hlY2tBbGl2ZSgpO1xuICAgICAgICBjb25zdCB0ID0gdG9rZW5PZihkZXApO1xuICAgICAgICBpZiAodCA9PT0gdW5kZWZpbmVkIHx8IHQgPT09IG51bGwpIHRocm93IG5ldyBFcnJvcihgW0luamVjdG9yXSAke3JlcXVlc3RlciB8fCAncmVzb2x2ZSd9OiB0aGUgZm9yd2FyZCByZWZlcmVuY2UgcmV0dXJuZWQgJHt0fS5gKTtcbiAgICAgICAgaWYgKG92ZXJyaWRlcyAmJiBvdmVycmlkZXMuaGFzKHQpKSByZXR1cm4gb3ZlcnJpZGVzLmdldCh0KTtcbiAgICAgICAgaWYgKGRlcC5hbGwpIHJldHVybiB0aGlzLmNvbGxlY3QodCkubWFwKCh7IHJlZywgb3duZXIgfSkgPT4gdGhpcy5pbnN0YW5jZU9mKHJlZywgb3duZXIpKTtcbiAgICAgICAgaWYgKHQgPT09IENvbnRhaW5lcikgcmV0dXJuIHRoaXM7XG4gICAgICAgIGNvbnN0IGZvdW5kID0gdGhpcy5maW5kKHQpO1xuICAgICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgICAgICBpZiAoZGVwLm9wdGlvbmFsKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBbSW5qZWN0b3JdIE5vIHJlZ2lzdHJhdGlvbiBmb3IgJHt0b2tlbk5hbWUodCl9JHtyZXF1ZXN0ZXIgPyBgLCBuZWVkZWQgYnkgJHtyZXF1ZXN0ZXJ9YCA6ICcnfSwgYCArXG4gICAgICAgICAgICAgICAgYGluIHRoZSBzY29wZSBcIiR7dGhpcy5uYW1lfVwiJHt0aGlzLnBhcmVudCA/ICcgb3IgaXRzIHBhcmVudHMnIDogJyd9LiBSZWdpc3RlciBpdCBpbiBjb25maWd1cmUoKS5gLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5pbnN0YW5jZU9mKGZvdW5kLnJlZywgZm91bmQub3duZXIpO1xuICAgIH1cblxuICAgIC8qKiBAaW50ZXJuYWwgVGhlIGluc3RhbmNlIG9mIG9uZSBvZiB0aGlzIHNjb3BlJ3MgcmVnaXN0cmF0aW9ucy4gKi9cbiAgICByZXNvbHZlUmVnaXN0cmF0aW9uKHJlZzogUmVnaXN0cmF0aW9uKTogYW55IHtcbiAgICAgICAgdGhpcy5jaGVja0FsaXZlKCk7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlT2YocmVnLCB0aGlzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbGxlY3QodDogVG9rZW4pOiB7IHJlZzogUmVnaXN0cmF0aW9uOyBvd25lcjogQ29udGFpbmVyIH1bXSB7XG4gICAgICAgIGNvbnN0IG91dCA9IHRoaXMucGFyZW50ID8gdGhpcy5wYXJlbnQuY29sbGVjdCh0KSA6IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IHJlZyBvZiB0aGlzLm1hcC5nZXQodCkgfHwgW10pIG91dC5wdXNoKHsgcmVnLCBvd25lcjogdGhpcyB9KTtcbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluc3RhbmNlT2YocmVnOiBSZWdpc3RyYXRpb24sIG93bmVyOiBDb250YWluZXIpOiBhbnkge1xuICAgICAgICByZWcucmVzb2x2ZUNvdW50Kys7XG4gICAgICAgIGlmIChyZWcuaGFzSW5zdGFuY2UpIHJldHVybiByZWcuaW5zdGFuY2U7XG4gICAgICAgIHN3aXRjaCAocmVnLmxpZmV0aW1lKSB7XG4gICAgICAgICAgICBjYXNlIExpZmV0aW1lLlNpbmdsZXRvbjoge1xuICAgICAgICAgICAgICAgIC8vIE1hZGUgYnkgaXRzIG93bmVyOiBhIHNpbmdsZXRvbiBuZXZlciBzZWVzIGEgY2hpbGQgc2NvcGUncyByZWdpc3RyYXRpb25zLlxuICAgICAgICAgICAgICAgIGNvbnN0IGluc3QgPSBvd25lci5jcmVhdGUocmVnKTtcbiAgICAgICAgICAgICAgICByZWcuaW5zdGFuY2UgPSBpbnN0O1xuICAgICAgICAgICAgICAgIHJlZy5oYXNJbnN0YW5jZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgb3duZXIub3duZWQucHVzaCh7IHJlZywgaW5zdGFuY2U6IGluc3QgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIExpZmV0aW1lLlNjb3BlZDoge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjb3BlZC5oYXMocmVnKSkgcmV0dXJuIHRoaXMuc2NvcGVkLmdldChyZWcpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluc3QgPSB0aGlzLmNyZWF0ZShyZWcpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2NvcGVkLnNldChyZWcsIGluc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMub3duZWQucHVzaCh7IHJlZywgaW5zdGFuY2U6IGluc3QgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZShyZWcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjcmVhdGUocmVnOiBSZWdpc3RyYXRpb24pOiBhbnkge1xuICAgICAgICBjb25zdCBhdCA9IGNyZWF0aW5nLmluZGV4T2YocmVnKTtcbiAgICAgICAgaWYgKGF0ID49IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHBhdGggPSBbLi4uY3JlYXRpbmcuc2xpY2UoYXQpLCByZWddLm1hcCgocikgPT4gci5uYW1lKS5qb2luKCcg4oaSICcpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBbSW5qZWN0b3JdIENpcmN1bGFyIGRlcGVuZGVuY3k6ICR7cGF0aH0uYCk7XG4gICAgICAgIH1cbiAgICAgICAgY3JlYXRpbmcucHVzaChyZWcpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgaW5zdCA9IHJlZy5mYWN0b3J5ID8gcmVnLmZhY3RvcnkodGhpcykgOiB0aGlzLmNvbnN0cnVjdChyZWcudHlwZSBhcyBDbGFzcywgcmVnLm5hbWUsIHJlZy5wYXJhbWV0ZXJzKTtcbiAgICAgICAgICAgIHJlZy5pbnN0YW5jZUNvdW50Kys7XG4gICAgICAgICAgICByZXR1cm4gaW5zdDtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNyZWF0aW5nLnBvcCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb25zdHJ1Y3Q8VD4odHlwZTogQ2xhc3M8VD4sIG5hbWU6IHN0cmluZywgb3ZlcnJpZGVzOiBNYXA8VG9rZW4sIGFueT4gfCBudWxsKTogVCB7XG4gICAgICAgIGNvbnN0IGluZm8gPSBpbmplY3Rpb25JbmZvKHR5cGUpO1xuICAgICAgICBjb25zdCBhcmdzID0gKGluZm8uY3RvciB8fCBbXSkubWFwKChkLCBpKSA9PiB0aGlzLmdldChkLCBgJHtuYW1lfSAoY29uc3RydWN0b3IgcGFyYW1ldGVyICR7aSArIDF9KWAsIG92ZXJyaWRlcykpO1xuICAgICAgICBjb25zdCBpbnN0ID0gbmV3IHR5cGUoLi4uYXJncyk7XG4gICAgICAgIHRoaXMuaW5qZWN0SW50byhpbnN0LCBpbmZvLCBuYW1lLCBvdmVycmlkZXMpO1xuICAgICAgICByZXR1cm4gaW5zdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluamVjdEludG8ob2JqOiBhbnksIGluZm86IEluamVjdGlvbkluZm8sIG5hbWU6IHN0cmluZywgb3ZlcnJpZGVzOiBNYXA8VG9rZW4sIGFueT4gfCBudWxsKTogdm9pZCB7XG4gICAgICAgIGZvciAoY29uc3QgZiBvZiBpbmZvLmZpZWxkcykgb2JqW2Yua2V5XSA9IHRoaXMuZ2V0KGYuZGVwLCBgJHtuYW1lfS4ke2Yua2V5fWAsIG92ZXJyaWRlcyk7XG4gICAgICAgIGZvciAoY29uc3QgbSBvZiBpbmZvLm1ldGhvZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGFyZ3MgPSBtLmRlcHMubWFwKChkLCBpKSA9PiB0aGlzLmdldChkLCBgJHtuYW1lfS4ke20ua2V5fSgpIHBhcmFtZXRlciAke2kgKyAxfWAsIG92ZXJyaWRlcykpO1xuICAgICAgICAgICAgb2JqW20ua2V5XSguLi5hcmdzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY2hlY2tBbGl2ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcG9zZWQpIHRocm93IG5ldyBFcnJvcihgW0luamVjdG9yXSBUaGUgc2NvcGUgXCIke3RoaXMubmFtZX1cIiBpcyBkaXNwb3NlZC5gKTtcbiAgICB9XG5cbiAgICAvKiogTWlzc2luZyByZWdpc3RyYXRpb25zIGFuZCBkZXBlbmRlbmN5IGN5Y2xlcyBvZiB0aGlzIHNjb3BlJ3MgY2xhc3NlcywgYWxsIGF0IG9uY2UuICovXG4gICAgdmFsaWRhdGUoKTogc3RyaW5nW10ge1xuICAgICAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IHJlc29sdmFibGUgPSAocmVnOiBSZWdpc3RyYXRpb24sIHQ6IFRva2VuKSA9PiByZWcucGFyYW1ldGVycy5oYXModCkgfHwgdCA9PT0gQ29udGFpbmVyIHx8ICEhdGhpcy5maW5kKHQpO1xuICAgICAgICBmb3IgKGNvbnN0IHJlZyBvZiB0aGlzLnJlZ2lzdHJhdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChyZWcua2luZCAhPT0gJ3R5cGUnKSBjb250aW51ZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgeyBkZXAsIHBvaW50IH0gb2YgZGVwZW5kZW5jaWVzT2YocmVnLnR5cGUhKSkge1xuICAgICAgICAgICAgICAgIGlmIChkZXAub3B0aW9uYWwgfHwgZGVwLmFsbCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHQ6IFRva2VuIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB0b2tlbk9mKGRlcCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaChgJHtyZWcubmFtZX06IHRoZSBmb3J3YXJkIHJlZmVyZW5jZSBvZiB0aGUgJHtwb2ludH0gZmFpbGVkOiAkeyhlIGFzIEVycm9yKT8ubWVzc2FnZSB8fCBlfWApO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHQgPT09IHVuZGVmaW5lZCB8fCB0ID09PSBudWxsKSBlcnJvcnMucHVzaChgJHtyZWcubmFtZX06IHRoZSAke3BvaW50fSBpcyAke3R9IChmb3J3YXJkIHJlZmVyZW5jZSkuYCk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoIXJlc29sdmFibGUocmVnLCB0KSkgZXJyb3JzLnB1c2goYCR7cmVnLm5hbWV9IG5lZWRzICR7dG9rZW5OYW1lKHQpfSAoJHtwb2ludH0pLCB3aGljaCBpcyBub3QgcmVnaXN0ZXJlZC5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBDeWNsZXMgYmV0d2VlbiBjbGFzc2VzIChmYWN0b3JpZXMgY2FuJ3QgYmUgZm9sbG93ZWQpLlxuICAgICAgICBjb25zdCBzdGF0ZSA9IG5ldyBNYXA8UmVnaXN0cmF0aW9uLCAxIHwgMj4oKTtcbiAgICAgICAgY29uc3Qgc3RhY2s6IFJlZ2lzdHJhdGlvbltdID0gW107XG4gICAgICAgIGNvbnN0IHJlcG9ydGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICAgIGNvbnN0IHZpc2l0ID0gKHJlZzogUmVnaXN0cmF0aW9uLCBvd25lcjogQ29udGFpbmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuZ2V0KHJlZykgPT09IDIgfHwgcmVnLmtpbmQgIT09ICd0eXBlJykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHN0YXRlLmdldChyZWcpID09PSAxKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IFsuLi5zdGFjay5zbGljZShzdGFjay5pbmRleE9mKHJlZykpLCByZWddLm1hcCgocikgPT4gci5uYW1lKS5qb2luKCcg4oaSICcpO1xuICAgICAgICAgICAgICAgIGlmICghcmVwb3J0ZWQuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcG9ydGVkLmFkZChwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goYENpcmN1bGFyIGRlcGVuZGVuY3k6ICR7cGF0aH0uYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRlLnNldChyZWcsIDEpO1xuICAgICAgICAgICAgc3RhY2sucHVzaChyZWcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB7IGRlcCB9IG9mIGRlcGVuZGVuY2llc09mKHJlZy50eXBlISkpIHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwLmFsbCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHQ6IFRva2VuIHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB0b2tlbk9mKGRlcCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXQgfHwgcmVnLnBhcmFtZXRlcnMuaGFzKHQpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAvLyBTaW5nbGV0b25zIHJlc29sdmUgZnJvbSB0aGVpciBvd25lcjsgdGhlIHJlc3QgZnJvbSB0aGlzIHNjb3BlLlxuICAgICAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gKHJlZy5saWZldGltZSA9PT0gTGlmZXRpbWUuU2luZ2xldG9uID8gb3duZXIgOiB0aGlzKS5maW5kKHQpO1xuICAgICAgICAgICAgICAgIGlmIChmb3VuZCkgdmlzaXQoZm91bmQucmVnLCBmb3VuZC5vd25lcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgIHN0YXRlLnNldChyZWcsIDIpO1xuICAgICAgICB9O1xuICAgICAgICBmb3IgKGNvbnN0IHJlZyBvZiB0aGlzLnJlZ2lzdHJhdGlvbnMpIHZpc2l0KHJlZywgdGhpcyk7XG4gICAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBidWlsZENvbnRhaW5lcihiOiBDb250YWluZXJCdWlsZGVyKTogQ29udGFpbmVyIHtcbiAgICBjb25zdCBjID0gbmV3IENvbnRhaW5lcihiKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBlcnJvcnMgPSBjLnZhbGlkYXRlKCk7XG4gICAgICAgIGlmIChlcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFtJbmplY3Rvcl0gVGhlIHNjb3BlIFwiJHtjLm5hbWV9XCIgY2FuJ3QgYmUgYnVpbHQ6XFxuICAtICR7ZXJyb3JzLmpvaW4oJ1xcbiAgLSAnKX1gKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZuIG9mIGIuYnVpbGRDYWxsYmFja3MpIGZuKGMpO1xuICAgICAgICBjb25zdCBlbnRyaWVzID0gYy5yZWdpc3RyYXRpb25zXG4gICAgICAgICAgICAuZmlsdGVyKChyKSA9PiByLmVudHJ5UG9pbnQpXG4gICAgICAgICAgICAubWFwKChyKSA9PiAoeyBpbnN0YW5jZTogYy5yZXNvbHZlUmVnaXN0cmF0aW9uKHIpLCBuYW1lOiByLm5hbWUgfSkpO1xuICAgICAgICBFbnRyeVBvaW50cy5hZGQoYywgZW50cmllcywgYi5lbnRyeVBvaW50RXhjZXB0aW9uSGFuZGxlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjLmRpc3Bvc2UoKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgcmV0dXJuIGM7XG59XG5cbnNldENvbnRhaW5lckZhY3RvcnkoYnVpbGRDb250YWluZXIpO1xuIl19