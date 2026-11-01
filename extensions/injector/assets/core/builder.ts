/**
 * Registrations (VContainer's IContainerBuilder):
 *
 *     builder.register(AudioService, Lifetime.Singleton);
 *     builder.register(AdMobAds, Lifetime.Singleton).as(IAds);
 *     builder.registerInstance(config);
 *     builder.registerFactory(EnemyFactory, (r) => (hp: number) => new Enemy(hp, r.resolve(AudioService)), Lifetime.Scoped);
 *     builder.registerEntryPoint(GamePresenter);
 */
import type { Container } from './container';
import { Class, Token, tokenName } from './token';

/**
 * - Singleton: one instance, shared with child scopes.
 * - Scoped: one instance per scope (child scopes make their own).
 * - Transient: a new instance every time.
 */
export enum Lifetime {
    Transient = 0,
    Singleton = 1,
    Scoped = 2,
}

export type RegistrationKind = 'type' | 'instance' | 'factory' | 'component';

let nextId = 1;

export class Registration {
    readonly id = nextId++;
    /** Tokens it is resolved by (filled at build: the class itself unless as() was used). */
    tokens: Token[] = [];
    asSelf = false;
    /** Overrides for some of the class's dependencies (withParameter). */
    readonly parameters = new Map<Token, any>();
    entryPoint = false;
    /** Singleton instance, kept by the container that owns the registration. */
    instance: any = undefined;
    hasInstance = false;
    /** Called for the instances this registration created when their scope is disposed (e.g. destroy a node). */
    release: ((instance: any) => void) | null = null;
    /** Display name in messages and the Diagnostics window. */
    name: string;
    // Diagnostics
    resolveCount = 0;
    instanceCount = 0;

    constructor(
        readonly kind: RegistrationKind,
        public lifetime: Lifetime,
        /** The class to construct (type), or the instance's class. */
        readonly type: Function | null,
        readonly factory: ((resolver: Container) => any) | null = null,
    ) {
        this.name = type ? tokenName(type) : 'factory';
    }

    /** The class itself: the default token. */
    get self(): Token | null {
        return this.type as Token | null;
    }
}

export class RegistrationBuilder<T = any> {
    constructor(readonly registration: Registration) {}

    /** Resolve it by these tokens (instead of its own class, unless asSelf() is added). */
    as(...tokens: Token[]): this {
        for (const t of tokens) {
            if (t === undefined || t === null) throw new Error(`[Injector] ${this.registration.name}.as(): a token is ${t} (circular import?).`);
            if (!this.registration.tokens.includes(t)) this.registration.tokens.push(t);
        }
        // Values without a class (numbers, strings, functions) are named after their token.
        const r = this.registration;
        if ((!r.type || r.type === Object) && r.kind === 'instance' && tokens.length) r.name = tokenName(tokens[0]);
        return this;
    }

    /** Also resolve it by its own class. */
    asSelf(): this {
        this.registration.asSelf = true;
        return this;
    }

    /** Gives this value for one dependency of the class (any injection point asking for `token`). */
    withParameter<P>(t: Token<P>, value: P): this {
        this.registration.parameters.set(t, value);
        return this;
    }
}

export type Installer = (builder: ContainerBuilder) => void;

export class ContainerBuilder {
    readonly registrations: Registration[] = [];
    readonly buildCallbacks: ((c: Container) => void)[] = [];
    entryPointExceptionHandler: ((error: unknown) => void) | null = null;
    /** The LifetimeScope being configured (Cocos registrations use its node and scene). */
    scope: any = null;

    constructor(
        /** The scope this one will be a child of. */
        readonly parent: Container | null = null,
        public name = 'Container',
    ) {}

    /** A class, constructed with its @inject dependencies. */
    register<T>(type: Class<T>, lifetime: Lifetime): RegistrationBuilder<T> {
        if (typeof type !== 'function') throw new Error(`[Injector] register(): ${String(type)} is not a class (circular import?).`);
        if (lifetime === undefined) throw new Error(`[Injector] register(${tokenName(type)}): give a Lifetime (Singleton, Scoped or Transient).`);
        return this.add(new Registration('type', lifetime, type));
    }

    /** An existing object (not disposed by the container). */
    registerInstance<T>(instance: T): RegistrationBuilder<T> {
        if (instance === undefined || instance === null) throw new Error('[Injector] registerInstance(): the instance is ' + instance + '.');
        const type = typeof instance === 'object' || typeof instance === 'function' ? (instance as any).constructor || null : null;
        const r = new Registration('instance', Lifetime.Singleton, type);
        r.instance = instance;
        r.hasInstance = true;
        if (!type || type === Object) r.name = 'instance';
        return this.add(r);
    }

    /**
     * Whatever `factory` returns, by `token` (VContainer's Register<T>(resolver => ...)).
     * For a factory function to inject, return a function.
     */
    registerFactory<T>(t: Token<T>, factory: (resolver: Container) => T, lifetime: Lifetime): RegistrationBuilder<T> {
        if (lifetime === undefined) throw new Error(`[Injector] registerFactory(${tokenName(t)}): give a Lifetime.`);
        const r = new Registration('factory', lifetime, null, factory);
        r.name = tokenName(t);
        r.tokens.push(t);
        return this.add(r);
    }

    /** A class whose initialize / start / tick / lateTick / dispose... are called by the scope. */
    registerEntryPoint<T>(type: Class<T>, lifetime: Lifetime = Lifetime.Singleton): RegistrationBuilder<T> {
        const b = this.register(type, lifetime);
        b.registration.entryPoint = true;
        return b;
    }

    /** Called with the container once it is built. */
    registerBuildCallback(fn: (container: Container) => void): this {
        this.buildCallbacks.push(fn);
        return this;
    }

    /** Errors thrown by entry points go here instead of the console. */
    registerEntryPointExceptionHandler(fn: (error: unknown) => void): this {
        this.entryPointExceptionHandler = fn;
        return this;
    }

    /** Whether the token is registered here (or in a parent scope). */
    exists(t: Token, includeParents = true): boolean {
        if (this.registrations.some((r) => tokensOf(r).includes(t))) return true;
        return includeParents && !!this.parent?.has(t);
    }

    /** Adds a registration made elsewhere (the Cocos component registrations). */
    add<T>(r: Registration): RegistrationBuilder<T> {
        this.registrations.push(r);
        return new RegistrationBuilder<T>(r);
    }

    /** Builds the container (a child of `parent` when given). */
    build(): Container {
        // Imported lazily: container.ts imports this module.
        return containerFactory(this);
    }
}

/** The tokens a registration answers to. */
export function tokensOf(r: Registration): Token[] {
    const out = r.tokens.slice();
    if ((out.length === 0 || r.asSelf) && r.self && !out.includes(r.self)) out.push(r.self);
    return out;
}

let containerFactory: (b: ContainerBuilder) => Container = () => {
    throw new Error('[Injector] container module not loaded');
};

export function setContainerFactory(fn: (b: ContainerBuilder) => Container): void {
    containerFactory = fn;
}
