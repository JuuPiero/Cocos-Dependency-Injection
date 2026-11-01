/**
 * Entry points (VContainer's IStartable, ITickable...): plain classes that
 * the scope calls at points of the frame, without being components.
 *
 *     export class GamePresenter implements Startable, Tickable, Disposable {
 *         start() {}
 *         tick(dt: number) {}
 *         dispose() {}
 *     }
 *     builder.registerEntryPoint(GamePresenter);
 *
 * In a Cocos frame:
 *   build              initialize, postInitialize
 *   before update      start, startAsync, postStart (once), fixedTick, postFixedTick, tick
 *   (components' start and update)
 *   after update       postTick, lateTick
 *   (components' lateUpdate)
 *   after lateUpdate   postLateTick
 *   scope disposed     dispose
 */
export interface Initializable { initialize(): void }
export interface PostInitializable { postInitialize(): void }
export interface Startable { start(): void }
export interface AsyncStartable { startAsync(cancellation: CancellationToken): Promise<void> }
export interface PostStartable { postStart(): void }
export interface FixedTickable { fixedTick(dt: number): void }
export interface PostFixedTickable { postFixedTick(dt: number): void }
export interface Tickable { tick(dt: number): void }
export interface PostTickable { postTick(dt: number): void }
export interface LateTickable { lateTick(dt: number): void }
export interface PostLateTickable { postLateTick(dt: number): void }
export interface Disposable { dispose(): void }

export class OperationCancelledError extends Error {
    constructor() {
        super('The operation was cancelled.');
        this.name = 'OperationCancelledError';
    }
}

/** Cancelled when the scope of an AsyncStartable is disposed. */
export class CancellationToken {
    private _cancelled = false;
    private callbacks: (() => void)[] = [];

    get isCancelled(): boolean {
        return this._cancelled;
    }

    /** Runs `fn` on cancellation (right away when already cancelled). Returns an unsubscribe function. */
    onCancelled(fn: () => void): () => void {
        if (this._cancelled) {
            fn();
            return () => undefined;
        }
        this.callbacks.push(fn);
        return () => {
            const i = this.callbacks.indexOf(fn);
            if (i >= 0) this.callbacks.splice(i, 1);
        };
    }

    throwIfCancelled(): void {
        if (this._cancelled) throw new OperationCancelledError();
    }

    cancel(): void {
        if (this._cancelled) return;
        this._cancelled = true;
        const list = this.callbacks;
        this.callbacks = [];
        for (const fn of list) {
            try {
                fn();
            } catch (e) {
                console.error('[Injector] cancellation callback:', e);
            }
        }
    }
}

type Phase = 'fixedTick' | 'postFixedTick' | 'tick' | 'postTick' | 'lateTick' | 'postLateTick';
const PHASES: Phase[] = ['fixedTick', 'postFixedTick', 'tick', 'postTick', 'lateTick', 'postLateTick'];

export interface EntryPointOwner {
    readonly name: string;
}

interface Entry {
    owner: EntryPointOwner;
    instance: any;
    name: string;
    onError: ((e: unknown) => void) | null;
    cancellation: CancellationToken;
}

export class EntryPointDispatcher {
    /** Seconds per fixedTick. */
    fixedTimeStep = 1 / 60;
    /** Most fixed steps in one frame (avoids a spiral after a hitch). */
    maxFixedSteps = 5;
    private accumulator = 0;
    private entries: Entry[] = [];
    private pendingStart: Entry[] = [];
    private lists = new Map<Phase, Entry[]>(PHASES.map((p) => [p, []]));

    /** Entry points of every live scope (diagnostics). */
    get all(): readonly { owner: EntryPointOwner; instance: any; name: string }[] {
        return this.entries;
    }

    /** Calls initialize / postInitialize now; start and the ticks follow at the next frame. */
    add(owner: EntryPointOwner, items: { instance: any; name: string }[], onError: ((e: unknown) => void) | null): void {
        const added = items.map((it) => ({ owner, instance: it.instance, name: it.name, onError, cancellation: new CancellationToken() }));
        if (!added.length) return;
        this.entries.push(...added);
        for (const e of added) this.call(e, 'initialize');
        for (const e of added) this.call(e, 'postInitialize');
        this.pendingStart.push(...added.filter((e) => this.entries.includes(e)));
        this.rebuild();
    }

    /** Stops calling the entry points of a scope (their startAsync is cancelled). */
    remove(owner: EntryPointOwner): void {
        const gone = this.entries.filter((e) => e.owner === owner);
        if (!gone.length) return;
        this.entries = this.entries.filter((e) => e.owner !== owner);
        this.pendingStart = this.pendingStart.filter((e) => e.owner !== owner);
        for (const e of gone) e.cancellation.cancel();
        this.rebuild();
    }

    /** Before the components' update: start (new ones), fixed steps, tick. */
    beforeUpdate(dt: number): void {
        if (this.pendingStart.length) {
            const starting = this.pendingStart;
            this.pendingStart = [];
            for (const e of starting) {
                if (!this.entries.includes(e)) continue;
                this.call(e, 'start');
                if (typeof e.instance.startAsync === 'function') this.startAsync(e);
            }
            for (const e of starting) if (this.entries.includes(e)) this.call(e, 'postStart');
        }
        const fixed = this.lists.get('fixedTick')!;
        const postFixed = this.lists.get('postFixedTick')!;
        if (fixed.length || postFixed.length) {
            const step = this.fixedTimeStep;
            this.accumulator += dt;
            let n = 0;
            while (this.accumulator >= step && n < this.maxFixedSteps) {
                this.accumulator -= step;
                n++;
                this.run('fixedTick', step);
                this.run('postFixedTick', step);
            }
            if (n === this.maxFixedSteps) this.accumulator = Math.min(this.accumulator, step);
        } else {
            this.accumulator = 0;
        }
        this.run('tick', dt);
    }

    /** After the components' update, before their lateUpdate. */
    midUpdate(dt: number): void {
        this.run('postTick', dt);
        this.run('lateTick', dt);
    }

    /** After the components' lateUpdate. */
    afterUpdate(dt: number): void {
        this.run('postLateTick', dt);
    }

    private run(phase: Phase, dt: number): void {
        const list = this.lists.get(phase)!;
        for (let i = 0; i < list.length; i++) this.call(list[i], phase, dt);
    }

    private startAsync(e: Entry): void {
        let p: any;
        try {
            p = e.instance.startAsync(e.cancellation);
        } catch (err) {
            this.fail(e, 'startAsync', err);
            return;
        }
        if (p && typeof p.then === 'function') {
            p.then(undefined, (err: unknown) => {
                // By name: Error subclasses lose instanceof when compiled to ES5.
                if ((err as any)?.name === 'OperationCancelledError' && e.cancellation.isCancelled) return;
                this.fail(e, 'startAsync', err);
            });
        }
    }

    private call(e: Entry, method: string, arg?: number): void {
        const fn = e.instance[method];
        if (typeof fn !== 'function') return;
        try {
            fn.call(e.instance, arg);
        } catch (err) {
            this.fail(e, method, err);
        }
    }

    private fail(e: Entry, method: string, err: unknown): void {
        if (e.onError) {
            try {
                e.onError(err);
                return;
            } catch (inner) {
                err = inner;
            }
        }
        console.error(`[Injector] ${e.name}.${method}():`, err);
    }

    private rebuild(): void {
        for (const p of PHASES) this.lists.set(p, this.entries.filter((e) => typeof e.instance[p] === 'function'));
    }
}

/** Calls the entry points of every scope (the Cocos layer drives it from the director). */
export const EntryPoints = new EntryPointDispatcher();
