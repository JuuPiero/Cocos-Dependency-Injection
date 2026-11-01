"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerBuilder = exports.RegistrationBuilder = exports.Registration = exports.Lifetime = void 0;
exports.tokensOf = tokensOf;
exports.setContainerFactory = setContainerFactory;
const token_1 = require("./token");
/**
 * - Singleton: one instance, shared with child scopes.
 * - Scoped: one instance per scope (child scopes make their own).
 * - Transient: a new instance every time.
 */
var Lifetime;
(function (Lifetime) {
    Lifetime[Lifetime["Transient"] = 0] = "Transient";
    Lifetime[Lifetime["Singleton"] = 1] = "Singleton";
    Lifetime[Lifetime["Scoped"] = 2] = "Scoped";
})(Lifetime || (exports.Lifetime = Lifetime = {}));
let nextId = 1;
class Registration {
    constructor(kind, lifetime, 
    /** The class to construct (type), or the instance's class. */
    type, factory = null) {
        this.kind = kind;
        this.lifetime = lifetime;
        this.type = type;
        this.factory = factory;
        this.id = nextId++;
        /** Tokens it is resolved by (filled at build: the class itself unless as() was used). */
        this.tokens = [];
        this.asSelf = false;
        /** Overrides for some of the class's dependencies (withParameter). */
        this.parameters = new Map();
        this.entryPoint = false;
        /** Singleton instance, kept by the container that owns the registration. */
        this.instance = undefined;
        this.hasInstance = false;
        /** Called for the instances this registration created when their scope is disposed (e.g. destroy a node). */
        this.release = null;
        // Diagnostics
        this.resolveCount = 0;
        this.instanceCount = 0;
        this.name = type ? (0, token_1.tokenName)(type) : 'factory';
    }
    /** The class itself: the default token. */
    get self() {
        return this.type;
    }
}
exports.Registration = Registration;
class RegistrationBuilder {
    constructor(registration) {
        this.registration = registration;
    }
    /** Resolve it by these tokens (instead of its own class, unless asSelf() is added). */
    as(...tokens) {
        for (const t of tokens) {
            if (t === undefined || t === null)
                throw new Error(`[Injector] ${this.registration.name}.as(): a token is ${t} (circular import?).`);
            if (!this.registration.tokens.includes(t))
                this.registration.tokens.push(t);
        }
        return this;
    }
    /** Also resolve it by its own class. */
    asSelf() {
        this.registration.asSelf = true;
        return this;
    }
    /** Gives this value for one dependency of the class (any injection point asking for `token`). */
    withParameter(t, value) {
        this.registration.parameters.set(t, value);
        return this;
    }
}
exports.RegistrationBuilder = RegistrationBuilder;
class ContainerBuilder {
    constructor(
    /** The scope this one will be a child of. */
    parent = null, name = 'Container') {
        this.parent = parent;
        this.name = name;
        this.registrations = [];
        this.buildCallbacks = [];
        this.entryPointExceptionHandler = null;
        /** The LifetimeScope being configured (Cocos registrations use its node and scene). */
        this.scope = null;
    }
    /** A class, constructed with its @inject dependencies. */
    register(type, lifetime) {
        if (typeof type !== 'function')
            throw new Error(`[Injector] register(): ${String(type)} is not a class (circular import?).`);
        if (lifetime === undefined)
            throw new Error(`[Injector] register(${(0, token_1.tokenName)(type)}): give a Lifetime (Singleton, Scoped or Transient).`);
        return this.add(new Registration('type', lifetime, type));
    }
    /** An existing object (not disposed by the container). */
    registerInstance(instance) {
        if (instance === undefined || instance === null)
            throw new Error('[Injector] registerInstance(): the instance is ' + instance + '.');
        const type = typeof instance === 'object' || typeof instance === 'function' ? instance.constructor || null : null;
        const r = new Registration('instance', Lifetime.Singleton, type);
        r.instance = instance;
        r.hasInstance = true;
        if (!type || type === Object)
            r.name = 'instance';
        return this.add(r);
    }
    /**
     * Whatever `factory` returns, by `token` (VContainer's Register<T>(resolver => ...)).
     * For a factory function to inject, return a function.
     */
    registerFactory(t, factory, lifetime) {
        if (lifetime === undefined)
            throw new Error(`[Injector] registerFactory(${(0, token_1.tokenName)(t)}): give a Lifetime.`);
        const r = new Registration('factory', lifetime, null, factory);
        r.name = (0, token_1.tokenName)(t);
        r.tokens.push(t);
        return this.add(r);
    }
    /** A class whose initialize / start / tick / lateTick / dispose... are called by the scope. */
    registerEntryPoint(type, lifetime = Lifetime.Singleton) {
        const b = this.register(type, lifetime);
        b.registration.entryPoint = true;
        return b;
    }
    /** Called with the container once it is built. */
    registerBuildCallback(fn) {
        this.buildCallbacks.push(fn);
        return this;
    }
    /** Errors thrown by entry points go here instead of the console. */
    registerEntryPointExceptionHandler(fn) {
        this.entryPointExceptionHandler = fn;
        return this;
    }
    /** Whether the token is registered here (or in a parent scope). */
    exists(t, includeParents = true) {
        var _a;
        if (this.registrations.some((r) => tokensOf(r).includes(t)))
            return true;
        return includeParents && !!((_a = this.parent) === null || _a === void 0 ? void 0 : _a.has(t));
    }
    /** Adds a registration made elsewhere (the Cocos component registrations). */
    add(r) {
        this.registrations.push(r);
        return new RegistrationBuilder(r);
    }
    /** Builds the container (a child of `parent` when given). */
    build() {
        // Imported lazily: container.ts imports this module.
        return containerFactory(this);
    }
}
exports.ContainerBuilder = ContainerBuilder;
/** The tokens a registration answers to. */
function tokensOf(r) {
    const out = r.tokens.slice();
    if ((out.length === 0 || r.asSelf) && r.self && !out.includes(r.self))
        out.push(r.self);
    return out;
}
let containerFactory = () => {
    throw new Error('[Injector] container module not loaded');
};
function setContainerFactory(fn) {
    containerFactory = fn;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBMktBLDRCQUlDO0FBTUQsa0RBRUM7QUE3S0QsbUNBQWtEO0FBRWxEOzs7O0dBSUc7QUFDSCxJQUFZLFFBSVg7QUFKRCxXQUFZLFFBQVE7SUFDaEIsaURBQWEsQ0FBQTtJQUNiLGlEQUFhLENBQUE7SUFDYiwyQ0FBVSxDQUFBO0FBQ2QsQ0FBQyxFQUpXLFFBQVEsd0JBQVIsUUFBUSxRQUluQjtBQUlELElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztBQUVmLE1BQWEsWUFBWTtJQW1CckIsWUFDYSxJQUFzQixFQUN4QixRQUFrQjtJQUN6Qiw4REFBOEQ7SUFDckQsSUFBcUIsRUFDckIsVUFBaUQsSUFBSTtRQUpyRCxTQUFJLEdBQUosSUFBSSxDQUFrQjtRQUN4QixhQUFRLEdBQVIsUUFBUSxDQUFVO1FBRWhCLFNBQUksR0FBSixJQUFJLENBQWlCO1FBQ3JCLFlBQU8sR0FBUCxPQUFPLENBQThDO1FBdkJ6RCxPQUFFLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDdkIseUZBQXlGO1FBQ3pGLFdBQU0sR0FBWSxFQUFFLENBQUM7UUFDckIsV0FBTSxHQUFHLEtBQUssQ0FBQztRQUNmLHNFQUFzRTtRQUM3RCxlQUFVLEdBQUcsSUFBSSxHQUFHLEVBQWMsQ0FBQztRQUM1QyxlQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ25CLDRFQUE0RTtRQUM1RSxhQUFRLEdBQVEsU0FBUyxDQUFDO1FBQzFCLGdCQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLDZHQUE2RztRQUM3RyxZQUFPLEdBQXFDLElBQUksQ0FBQztRQUdqRCxjQUFjO1FBQ2QsaUJBQVksR0FBRyxDQUFDLENBQUM7UUFDakIsa0JBQWEsR0FBRyxDQUFDLENBQUM7UUFTZCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBQSxpQkFBUyxFQUFDLElBQUksQ0FB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QUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4RixPQUFPLEdBQUcsQ0FBQztBQUNmLENBQUM7QUFFRCxJQUFJLGdCQUFnQixHQUF1QyxHQUFHLEVBQUU7SUFDNUQsTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO0FBQzlELENBQUMsQ0FBQztBQUVGLFNBQWdCLG1CQUFtQixDQUFDLEVBQXNDO0lBQ3RFLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztBQUMxQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBSZWdpc3RyYXRpb25zIChWQ29udGFpbmVyJ3MgSUNvbnRhaW5lckJ1aWxkZXIpOlxuICpcbiAqICAgICBidWlsZGVyLnJlZ2lzdGVyKEF1ZGlvU2VydmljZSwgTGlmZXRpbWUuU2luZ2xldG9uKTtcbiAqICAgICBidWlsZGVyLnJlZ2lzdGVyKEFkTW9iQWRzLCBMaWZldGltZS5TaW5nbGV0b24pLmFzKElBZHMpO1xuICogICAgIGJ1aWxkZXIucmVnaXN0ZXJJbnN0YW5jZShjb25maWcpO1xuICogICAgIGJ1aWxkZXIucmVnaXN0ZXJGYWN0b3J5KEVuZW15RmFjdG9yeSwgKHIpID0+IChocDogbnVtYmVyKSA9PiBuZXcgRW5lbXkoaHAsIHIucmVzb2x2ZShBdWRpb1NlcnZpY2UpKSwgTGlmZXRpbWUuU2NvcGVkKTtcbiAqICAgICBidWlsZGVyLnJlZ2lzdGVyRW50cnlQb2ludChHYW1lUHJlc2VudGVyKTtcbiAqL1xuaW1wb3J0IHR5cGUgeyBDb250YWluZXIgfSBmcm9tICcuL2NvbnRhaW5lcic7XG5pbXBvcnQgeyBDbGFzcywgVG9rZW4sIHRva2VuTmFtZSB9IGZyb20gJy4vdG9rZW4nO1xuXG4vKipcbiAqIC0gU2luZ2xldG9uOiBvbmUgaW5zdGFuY2UsIHNoYXJlZCB3aXRoIGNoaWxkIHNjb3Blcy5cbiAqIC0gU2NvcGVkOiBvbmUgaW5zdGFuY2UgcGVyIHNjb3BlIChjaGlsZCBzY29wZXMgbWFrZSB0aGVpciBvd24pLlxuICogLSBUcmFuc2llbnQ6IGEgbmV3IGluc3RhbmNlIGV2ZXJ5IHRpbWUuXG4gKi9cbmV4cG9ydCBlbnVtIExpZmV0aW1lIHtcbiAgICBUcmFuc2llbnQgPSAwLFxuICAgIFNpbmdsZXRvbiA9IDEsXG4gICAgU2NvcGVkID0gMixcbn1cblxuZXhwb3J0IHR5cGUgUmVnaXN0cmF0aW9uS2luZCA9ICd0eXBlJyB8ICdpbnN0YW5jZScgfCAnZmFjdG9yeScgfCAnY29tcG9uZW50JztcblxubGV0IG5leHRJZCA9IDE7XG5cbmV4cG9ydCBjbGFzcyBSZWdpc3RyYXRpb24ge1xuICAgIHJlYWRvbmx5IGlkID0gbmV4dElkKys7XG4gICAgLyoqIFRva2VucyBpdCBpcyByZXNvbHZlZCBieSAoZmlsbGVkIGF0IGJ1aWxkOiB0aGUgY2xhc3MgaXRzZWxmIHVubGVzcyBhcygpIHdhcyB1c2VkKS4gKi9cbiAgICB0b2tlbnM6IFRva2VuW10gPSBbXTtcbiAgICBhc1NlbGYgPSBmYWxzZTtcbiAgICAvKiogT3ZlcnJpZGVzIGZvciBzb21lIG9mIHRoZSBjbGFzcydzIGRlcGVuZGVuY2llcyAod2l0aFBhcmFtZXRlcikuICovXG4gICAgcmVhZG9ubHkgcGFyYW1ldGVycyA9IG5ldyBNYXA8VG9rZW4sIGFueT4oKTtcbiAgICBlbnRyeVBvaW50ID0gZmFsc2U7XG4gICAgLyoqIFNpbmdsZXRvbiBpbnN0YW5jZSwga2VwdCBieSB0aGUgY29udGFpbmVyIHRoYXQgb3ducyB0aGUgcmVnaXN0cmF0aW9uLiAqL1xuICAgIGluc3RhbmNlOiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgaGFzSW5zdGFuY2UgPSBmYWxzZTtcbiAgICAvKiogQ2FsbGVkIGZvciB0aGUgaW5zdGFuY2VzIHRoaXMgcmVnaXN0cmF0aW9uIGNyZWF0ZWQgd2hlbiB0aGVpciBzY29wZSBpcyBkaXNwb3NlZCAoZS5nLiBkZXN0cm95IGEgbm9kZSkuICovXG4gICAgcmVsZWFzZTogKChpbnN0YW5jZTogYW55KSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICAgIC8qKiBEaXNwbGF5IG5hbWUgaW4gbWVzc2FnZXMgYW5kIHRoZSBEaWFnbm9zdGljcyB3aW5kb3cuICovXG4gICAgbmFtZTogc3RyaW5nO1xuICAgIC8vIERpYWdub3N0aWNzXG4gICAgcmVzb2x2ZUNvdW50ID0gMDtcbiAgICBpbnN0YW5jZUNvdW50ID0gMDtcblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICByZWFkb25seSBraW5kOiBSZWdpc3RyYXRpb25LaW5kLFxuICAgICAgICBwdWJsaWMgbGlmZXRpbWU6IExpZmV0aW1lLFxuICAgICAgICAvKiogVGhlIGNsYXNzIHRvIGNvbnN0cnVjdCAodHlwZSksIG9yIHRoZSBpbnN0YW5jZSdzIGNsYXNzLiAqL1xuICAgICAgICByZWFkb25seSB0eXBlOiBGdW5jdGlvbiB8IG51bGwsXG4gICAgICAgIHJlYWRvbmx5IGZhY3Rvcnk6ICgocmVzb2x2ZXI6IENvbnRhaW5lcikgPT4gYW55KSB8IG51bGwgPSBudWxsLFxuICAgICkge1xuICAgICAgICB0aGlzLm5hbWUgPSB0eXBlID8gdG9rZW5OYW1lKHR5cGUpIDogJ2ZhY3RvcnknO1xuICAgIH1cblxuICAgIC8qKiBUaGUgY2xhc3MgaXRzZWxmOiB0aGUgZGVmYXVsdCB0b2tlbi4gKi9cbiAgICBnZXQgc2VsZigpOiBUb2tlbiB8IG51bGwge1xuICAgICAgICByZXR1cm4gdGhpcy50eXBlIGFzIFRva2VuIHwgbnVsbDtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWdpc3RyYXRpb25CdWlsZGVyPFQgPSBhbnk+IHtcbiAgICBjb25zdHJ1Y3RvcihyZWFkb25seSByZWdpc3RyYXRpb246IFJlZ2lzdHJhdGlvbikge31cblxuICAgIC8qKiBSZXNvbHZlIGl0IGJ5IHRoZXNlIHRva2VucyAoaW5zdGVhZCBvZiBpdHMgb3duIGNsYXNzLCB1bmxlc3MgYXNTZWxmKCkgaXMgYWRkZWQpLiAqL1xuICAgIGFzKC4uLnRva2VuczogVG9rZW5bXSk6IHRoaXMge1xuICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdG9rZW5zKSB7XG4gICAgICAgICAgICBpZiAodCA9PT0gdW5kZWZpbmVkIHx8IHQgPT09IG51bGwpIHRocm93IG5ldyBFcnJvcihgW0luamVjdG9yXSAke3RoaXMucmVnaXN0cmF0aW9uLm5hbWV9LmFzKCk6IGEgdG9rZW4gaXMgJHt0fSAoY2lyY3VsYXIgaW1wb3J0PykuYCk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucmVnaXN0cmF0aW9uLnRva2Vucy5pbmNsdWRlcyh0KSkgdGhpcy5yZWdpc3RyYXRpb24udG9rZW5zLnB1c2godCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqIEFsc28gcmVzb2x2ZSBpdCBieSBpdHMgb3duIGNsYXNzLiAqL1xuICAgIGFzU2VsZigpOiB0aGlzIHtcbiAgICAgICAgdGhpcy5yZWdpc3RyYXRpb24uYXNTZWxmID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqIEdpdmVzIHRoaXMgdmFsdWUgZm9yIG9uZSBkZXBlbmRlbmN5IG9mIHRoZSBjbGFzcyAoYW55IGluamVjdGlvbiBwb2ludCBhc2tpbmcgZm9yIGB0b2tlbmApLiAqL1xuICAgIHdpdGhQYXJhbWV0ZXI8UD4odDogVG9rZW48UD4sIHZhbHVlOiBQKTogdGhpcyB7XG4gICAgICAgIHRoaXMucmVnaXN0cmF0aW9uLnBhcmFtZXRlcnMuc2V0KHQsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBJbnN0YWxsZXIgPSAoYnVpbGRlcjogQ29udGFpbmVyQnVpbGRlcikgPT4gdm9pZDtcblxuZXhwb3J0IGNsYXNzIENvbnRhaW5lckJ1aWxkZXIge1xuICAgIHJlYWRvbmx5IHJlZ2lzdHJhdGlvbnM6IFJlZ2lzdHJhdGlvbltdID0gW107XG4gICAgcmVhZG9ubHkgYnVpbGRDYWxsYmFja3M6ICgoYzogQ29udGFpbmVyKSA9PiB2b2lkKVtdID0gW107XG4gICAgZW50cnlQb2ludEV4Y2VwdGlvbkhhbmRsZXI6ICgoZXJyb3I6IHVua25vd24pID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gICAgLyoqIFRoZSBMaWZldGltZVNjb3BlIGJlaW5nIGNvbmZpZ3VyZWQgKENvY29zIHJlZ2lzdHJhdGlvbnMgdXNlIGl0cyBub2RlIGFuZCBzY2VuZSkuICovXG4gICAgc2NvcGU6IGFueSA9IG51bGw7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgLyoqIFRoZSBzY29wZSB0aGlzIG9uZSB3aWxsIGJlIGEgY2hpbGQgb2YuICovXG4gICAgICAgIHJlYWRvbmx5IHBhcmVudDogQ29udGFpbmVyIHwgbnVsbCA9IG51bGwsXG4gICAgICAgIHB1YmxpYyBuYW1lID0gJ0NvbnRhaW5lcicsXG4gICAgKSB7fVxuXG4gICAgLyoqIEEgY2xhc3MsIGNvbnN0cnVjdGVkIHdpdGggaXRzIEBpbmplY3QgZGVwZW5kZW5jaWVzLiAqL1xuICAgIHJlZ2lzdGVyPFQ+KHR5cGU6IENsYXNzPFQ+LCBsaWZldGltZTogTGlmZXRpbWUpOiBSZWdpc3RyYXRpb25CdWlsZGVyPFQ+IHtcbiAgICAgICAgaWYgKHR5cGVvZiB0eXBlICE9PSAnZnVuY3Rpb24nKSB0aHJvdyBuZXcgRXJyb3IoYFtJbmplY3Rvcl0gcmVnaXN0ZXIoKTogJHtTdHJpbmcodHlwZSl9IGlzIG5vdCBhIGNsYXNzIChjaXJjdWxhciBpbXBvcnQ/KS5gKTtcbiAgICAgICAgaWYgKGxpZmV0aW1lID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcihgW0luamVjdG9yXSByZWdpc3Rlcigke3Rva2VuTmFtZSh0eXBlKX0pOiBnaXZlIGEgTGlmZXRpbWUgKFNpbmdsZXRvbiwgU2NvcGVkIG9yIFRyYW5zaWVudCkuYCk7XG4gICAgICAgIHJldHVybiB0aGlzLmFkZChuZXcgUmVnaXN0cmF0aW9uKCd0eXBlJywgbGlmZXRpbWUsIHR5cGUpKTtcbiAgICB9XG5cbiAgICAvKiogQW4gZXhpc3Rpbmcgb2JqZWN0IChub3QgZGlzcG9zZWQgYnkgdGhlIGNvbnRhaW5lcikuICovXG4gICAgcmVnaXN0ZXJJbnN0YW5jZTxUPihpbnN0YW5jZTogVCk6IFJlZ2lzdHJhdGlvbkJ1aWxkZXI8VD4ge1xuICAgICAgICBpZiAoaW5zdGFuY2UgPT09IHVuZGVmaW5lZCB8fCBpbnN0YW5jZSA9PT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKCdbSW5qZWN0b3JdIHJlZ2lzdGVySW5zdGFuY2UoKTogdGhlIGluc3RhbmNlIGlzICcgKyBpbnN0YW5jZSArICcuJyk7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgaW5zdGFuY2UgPT09ICdvYmplY3QnIHx8IHR5cGVvZiBpbnN0YW5jZSA9PT0gJ2Z1bmN0aW9uJyA/IChpbnN0YW5jZSBhcyBhbnkpLmNvbnN0cnVjdG9yIHx8IG51bGwgOiBudWxsO1xuICAgICAgICBjb25zdCByID0gbmV3IFJlZ2lzdHJhdGlvbignaW5zdGFuY2UnLCBMaWZldGltZS5TaW5nbGV0b24sIHR5cGUpO1xuICAgICAgICByLmluc3RhbmNlID0gaW5zdGFuY2U7XG4gICAgICAgIHIuaGFzSW5zdGFuY2UgPSB0cnVlO1xuICAgICAgICBpZiAoIXR5cGUgfHwgdHlwZSA9PT0gT2JqZWN0KSByLm5hbWUgPSAnaW5zdGFuY2UnO1xuICAgICAgICByZXR1cm4gdGhpcy5hZGQocik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV2hhdGV2ZXIgYGZhY3RvcnlgIHJldHVybnMsIGJ5IGB0b2tlbmAgKFZDb250YWluZXIncyBSZWdpc3RlcjxUPihyZXNvbHZlciA9PiAuLi4pKS5cbiAgICAgKiBGb3IgYSBmYWN0b3J5IGZ1bmN0aW9uIHRvIGluamVjdCwgcmV0dXJuIGEgZnVuY3Rpb24uXG4gICAgICovXG4gICAgcmVnaXN0ZXJGYWN0b3J5PFQ+KHQ6IFRva2VuPFQ+LCBmYWN0b3J5OiAocmVzb2x2ZXI6IENvbnRhaW5lcikgPT4gVCwgbGlmZXRpbWU6IExpZmV0aW1lKTogUmVnaXN0cmF0aW9uQnVpbGRlcjxUPiB7XG4gICAgICAgIGlmIChsaWZldGltZSA9PT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoYFtJbmplY3Rvcl0gcmVnaXN0ZXJGYWN0b3J5KCR7dG9rZW5OYW1lKHQpfSk6IGdpdmUgYSBMaWZldGltZS5gKTtcbiAgICAgICAgY29uc3QgciA9IG5ldyBSZWdpc3RyYXRpb24oJ2ZhY3RvcnknLCBsaWZldGltZSwgbnVsbCwgZmFjdG9yeSk7XG4gICAgICAgIHIubmFtZSA9IHRva2VuTmFtZSh0KTtcbiAgICAgICAgci50b2tlbnMucHVzaCh0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkKHIpO1xuICAgIH1cblxuICAgIC8qKiBBIGNsYXNzIHdob3NlIGluaXRpYWxpemUgLyBzdGFydCAvIHRpY2sgLyBsYXRlVGljayAvIGRpc3Bvc2UuLi4gYXJlIGNhbGxlZCBieSB0aGUgc2NvcGUuICovXG4gICAgcmVnaXN0ZXJFbnRyeVBvaW50PFQ+KHR5cGU6IENsYXNzPFQ+LCBsaWZldGltZTogTGlmZXRpbWUgPSBMaWZldGltZS5TaW5nbGV0b24pOiBSZWdpc3RyYXRpb25CdWlsZGVyPFQ+IHtcbiAgICAgICAgY29uc3QgYiA9IHRoaXMucmVnaXN0ZXIodHlwZSwgbGlmZXRpbWUpO1xuICAgICAgICBiLnJlZ2lzdHJhdGlvbi5lbnRyeVBvaW50ID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIGI7XG4gICAgfVxuXG4gICAgLyoqIENhbGxlZCB3aXRoIHRoZSBjb250YWluZXIgb25jZSBpdCBpcyBidWlsdC4gKi9cbiAgICByZWdpc3RlckJ1aWxkQ2FsbGJhY2soZm46IChjb250YWluZXI6IENvbnRhaW5lcikgPT4gdm9pZCk6IHRoaXMge1xuICAgICAgICB0aGlzLmJ1aWxkQ2FsbGJhY2tzLnB1c2goZm4pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKiogRXJyb3JzIHRocm93biBieSBlbnRyeSBwb2ludHMgZ28gaGVyZSBpbnN0ZWFkIG9mIHRoZSBjb25zb2xlLiAqL1xuICAgIHJlZ2lzdGVyRW50cnlQb2ludEV4Y2VwdGlvbkhhbmRsZXIoZm46IChlcnJvcjogdW5rbm93bikgPT4gdm9pZCk6IHRoaXMge1xuICAgICAgICB0aGlzLmVudHJ5UG9pbnRFeGNlcHRpb25IYW5kbGVyID0gZm47XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKiBXaGV0aGVyIHRoZSB0b2tlbiBpcyByZWdpc3RlcmVkIGhlcmUgKG9yIGluIGEgcGFyZW50IHNjb3BlKS4gKi9cbiAgICBleGlzdHModDogVG9rZW4sIGluY2x1ZGVQYXJlbnRzID0gdHJ1ZSk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5yZWdpc3RyYXRpb25zLnNvbWUoKHIpID0+IHRva2Vuc09mKHIpLmluY2x1ZGVzKHQpKSkgcmV0dXJuIHRydWU7XG4gICAgICAgIHJldHVybiBpbmNsdWRlUGFyZW50cyAmJiAhIXRoaXMucGFyZW50Py5oYXModCk7XG4gICAgfVxuXG4gICAgLyoqIEFkZHMgYSByZWdpc3RyYXRpb24gbWFkZSBlbHNld2hlcmUgKHRoZSBDb2NvcyBjb21wb25lbnQgcmVnaXN0cmF0aW9ucykuICovXG4gICAgYWRkPFQ+KHI6IFJlZ2lzdHJhdGlvbik6IFJlZ2lzdHJhdGlvbkJ1aWxkZXI8VD4ge1xuICAgICAgICB0aGlzLnJlZ2lzdHJhdGlvbnMucHVzaChyKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZWdpc3RyYXRpb25CdWlsZGVyPFQ+KHIpO1xuICAgIH1cblxuICAgIC8qKiBCdWlsZHMgdGhlIGNvbnRhaW5lciAoYSBjaGlsZCBvZiBgcGFyZW50YCB3aGVuIGdpdmVuKS4gKi9cbiAgICBidWlsZCgpOiBDb250YWluZXIge1xuICAgICAgICAvLyBJbXBvcnRlZCBsYXppbHk6IGNvbnRhaW5lci50cyBpbXBvcnRzIHRoaXMgbW9kdWxlLlxuICAgICAgICByZXR1cm4gY29udGFpbmVyRmFjdG9yeSh0aGlzKTtcbiAgICB9XG59XG5cbi8qKiBUaGUgdG9rZW5zIGEgcmVnaXN0cmF0aW9uIGFuc3dlcnMgdG8uICovXG5leHBvcnQgZnVuY3Rpb24gdG9rZW5zT2YocjogUmVnaXN0cmF0aW9uKTogVG9rZW5bXSB7XG4gICAgY29uc3Qgb3V0ID0gci50b2tlbnMuc2xpY2UoKTtcbiAgICBpZiAoKG91dC5sZW5ndGggPT09IDAgfHwgci5hc1NlbGYpICYmIHIuc2VsZiAmJiAhb3V0LmluY2x1ZGVzKHIuc2VsZikpIG91dC5wdXNoKHIuc2VsZik7XG4gICAgcmV0dXJuIG91dDtcbn1cblxubGV0IGNvbnRhaW5lckZhY3Rvcnk6IChiOiBDb250YWluZXJCdWlsZGVyKSA9PiBDb250YWluZXIgPSAoKSA9PiB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdbSW5qZWN0b3JdIGNvbnRhaW5lciBtb2R1bGUgbm90IGxvYWRlZCcpO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldENvbnRhaW5lckZhY3RvcnkoZm46IChiOiBDb250YWluZXJCdWlsZGVyKSA9PiBDb250YWluZXIpOiB2b2lkIHtcbiAgICBjb250YWluZXJGYWN0b3J5ID0gZm47XG59XG4iXX0=