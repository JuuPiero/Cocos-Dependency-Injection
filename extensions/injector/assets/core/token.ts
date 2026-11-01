/**
 * Tokens: what a dependency is looked up by. A class (concrete or abstract)
 * is its own token. For anything else (numbers, strings, functions,
 * TypeScript interfaces) make an InjectionToken:
 *
 *     export const PlayerSpeed = token<number>('PlayerSpeed');
 *
 * TypeScript interfaces don't exist at runtime: use an abstract class as
 * the "interface" instead, it is a token and a type at once:
 *
 *     export abstract class IAds { abstract showInterstitial(): Promise<void>; }
 */
export type Class<T = any> = new (...args: any[]) => T;
export type AbstractClass<T = any> = abstract new (...args: any[]) => T;

export class InjectionToken<T = unknown> {
    /** Never set: carries T for type inference. */
    protected readonly _type?: T;

    constructor(readonly name: string) {}

    toString(): string {
        return this.name;
    }
}

export type Token<T = any> = Class<T> | AbstractClass<T> | InjectionToken<T>;

/** A token for values that have no class (numbers, strings, functions, interfaces). */
export function token<T>(name: string): InjectionToken<T> {
    return new InjectionToken<T>(name);
}

/** One injection point's request. */
export interface Dependency {
    token: Token | (() => Token);
    /** Missing registrations give undefined instead of an error. */
    optional: boolean;
    /** Every registration of the token, as an array. */
    all: boolean;
}

/** What @inject accepts: a token, `() => Token` (forward reference), optional(T) or all(T). */
export type InjectArg = Token | (() => Token) | DependencyArg;

export class DependencyArg {
    constructor(readonly dependency: Dependency) {}
}

/** Injects undefined when nothing is registered for the token. */
export function optional<T>(t: Token<T> | (() => Token<T>)): DependencyArg {
    return new DependencyArg({ token: t, optional: true, all: false });
}

/** Injects every registration of the token (this scope and its parents) as an array. */
export function all<T>(t: Token<T> | (() => Token<T>)): DependencyArg {
    return new DependencyArg({ token: t, optional: false, all: true });
}

/**
 * `() => Foo` arrow functions are forward references; classes are tokens. A native arrow has no
 * prototype. Builds compiled to ES5 (Cocos web builds) turn arrows into plain functions, which have
 * one: then an unnamed function with nothing on its prototype is a forward reference (a class used
 * as a token always has a name).
 */
export function isForwardRef(t: unknown): t is () => Token {
    if (typeof t !== 'function') return false;
    const proto = (t as any).prototype;
    return !proto || (!t.name && Object.getOwnPropertyNames(proto).length <= 1);
}

/** The token a dependency stands for (forward references followed). */
export function tokenOf(d: Dependency): Token {
    return isForwardRef(d.token) ? d.token() : (d.token as Token);
}

export function toDependency(arg: InjectArg): Dependency {
    if (arg instanceof DependencyArg) return arg.dependency;
    return { token: arg as Token, optional: false, all: false };
}

/** Names classes in messages and the Diagnostics window (the Cocos layer gives cc class names). */
export let classNameOf = (cls: Function): string => (cls as any).name || 'anonymous class';

export function setClassNameResolver(fn: (cls: Function) => string): void {
    classNameOf = fn;
}

export function tokenName(t: Token | (() => Token) | undefined | null): string {
    if (t === undefined || t === null) return String(t);
    if (t instanceof InjectionToken) return t.name;
    if (isForwardRef(t)) return tokenName(safe(t));
    if (typeof t === 'function') return classNameOf(t);
    return String(t);
}

function safe(f: () => Token): Token | undefined {
    try {
        return f();
    } catch {
        return undefined;
    }
}

export function isToken(t: unknown): t is Token {
    return typeof t === 'function' || t instanceof InjectionToken;
}
