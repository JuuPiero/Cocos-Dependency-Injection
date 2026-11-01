/** The container: registrations, lifetimes, injection points, scopes, validation, entry points. */
import assert from 'assert';
import {
    CancellationToken, Container, ContainerBuilder, EntryPoints, Lifetime, all, inject, optional, token,
} from '../assets/core';
import { done, test } from './harness';

abstract class ILogger {
    abstract log(s: string): void;
}

class MemoryLogger extends ILogger {
    lines: string[] = [];
    log(s: string) {
        this.lines.push(s);
    }
}

class Clock {
    static made = 0;
    id = ++Clock.made;
}

@inject(ILogger, Clock)
class Service {
    constructor(readonly logger: ILogger, readonly clock: Clock) {}
}

class Base {
    @inject(ILogger) logger!: ILogger;
    calls: string[] = [];
    @inject(Clock)
    setup(clock: Clock) {
        this.calls.push(`setup:${!!this.logger}:${clock.id}`);
    }
}

@inject(Service)
class Derived extends Base {
    @inject(optional(Number as any)) missing?: number;
    constructor(readonly service: Service) {
        super();
    }
}

const Speed = token<number>('Speed');

@inject(Speed)
class Ship {
    constructor(readonly speed: number) {}
}

function build(fn: (b: ContainerBuilder) => void, name = 'Test'): Container {
    const b = new ContainerBuilder(null, name);
    fn(b);
    return b.build();
}

(async () => {
    await test('lifetimes: singleton, transient, scoped per scope', () => {
        const root = build((b) => {
            b.register(Clock, Lifetime.Transient);
            b.register(MemoryLogger, Lifetime.Singleton).as(ILogger);
            b.register(Service, Lifetime.Scoped);
        });
        assert.notStrictEqual(root.resolve(Clock), root.resolve(Clock), 'transient');
        assert.strictEqual(root.resolve(ILogger), root.resolve(ILogger), 'singleton');
        assert.strictEqual(root.resolve(Service), root.resolve(Service), 'scoped in one scope');
        const child = root.createScope();
        assert.strictEqual(child.resolve(ILogger), root.resolve(ILogger), 'singleton shared with children');
        assert.notStrictEqual(child.resolve(Service), root.resolve(Service), 'scoped: one per scope');
        assert.strictEqual(child.resolve(Service), child.resolve(Service));
        root.dispose();
    });

    await test('constructor, field and method injection, through base classes', () => {
        const c = build((b) => {
            b.register(MemoryLogger, Lifetime.Singleton).as(ILogger);
            b.register(Clock, Lifetime.Singleton);
            b.register(Service, Lifetime.Singleton);
            b.register(Derived, Lifetime.Transient);
        });
        const d = c.resolve(Derived);
        assert.ok(d.service instanceof Service && d.service.logger instanceof MemoryLogger);
        assert.ok(d.logger instanceof MemoryLogger, 'base class field');
        assert.deepStrictEqual(d.calls, [`setup:true:${c.resolve(Clock).id}`], 'methods run after fields');
        assert.strictEqual(d.missing, undefined, 'optional');
        c.dispose();
    });

    await test('as() replaces the class token, asSelf() keeps it; the last registration wins', () => {
        const c = build((b) => {
            b.register(MemoryLogger, Lifetime.Singleton).as(ILogger);
            b.register(Clock, Lifetime.Singleton).as(Object as any).asSelf();
        });
        assert.ok(!c.has(MemoryLogger) && c.has(ILogger));
        assert.ok(c.has(Clock));
        const second = build((b) => {
            b.registerInstance(new MemoryLogger()).as(ILogger);
            b.register(MemoryLogger, Lifetime.Singleton).as(ILogger);
        });
        assert.ok(second.resolve(ILogger) instanceof MemoryLogger);
        assert.strictEqual(second.resolveAll(ILogger).length, 2);
    });

    await test('instances, factories, tokens, withParameter, the container itself', () => {
        const logger = new MemoryLogger();
        const c = build((b) => {
            b.registerInstance(logger).as(ILogger);
            b.registerInstance(7).as(Speed);
            b.registerFactory(Ship, (r) => new Ship(r.resolve(Speed) * 2), Lifetime.Transient);
            b.register(Ship, Lifetime.Transient).as(token('SlowShip') as any).withParameter(Speed, 1);
        });
        assert.strictEqual(c.resolve(ILogger), logger);
        assert.strictEqual(c.resolve(Ship).speed, 14, 'factory');
        assert.strictEqual(c.resolve(Container), c);
        const slow = c.resolveAll(Ship);
        assert.strictEqual(slow.length, 1);
        const withParam = c.registrations.find((r) => r.parameters.size)!;
        assert.strictEqual(c.resolveRegistration(withParam).speed, 1, 'withParameter overrides Speed');
    });

    await test('optional(), all() through parents, tryResolve, forward references', () => {
        const root = build((b) => b.registerInstance(new MemoryLogger()).as(ILogger));
        const child = root.createScope((b) => b.register(MemoryLogger, Lifetime.Scoped).as(ILogger));
        class Needs {
            @inject(all(ILogger)) loggers!: ILogger[];
            @inject(optional(Clock)) clock?: Clock;
            @inject(() => Later) later!: any;
        }
        class Later {}
        const leaf = child.createScope((b) => b.register(Later, Lifetime.Singleton));
        const n = leaf.inject(new Needs());
        assert.strictEqual(n.loggers.length, 2, 'parent first, then own');
        assert.strictEqual(n.clock, undefined);
        assert.ok(n.later instanceof Later);
        assert.strictEqual(leaf.tryResolve(Clock), undefined);
        assert.ok(leaf.instantiate(Later) instanceof Later);
        root.dispose();
    });

    await test('build lists every missing registration and cycles', () => {
        @inject(() => B) class A {}
        @inject(A) class B {}
        @inject(ILogger, Speed) class Lonely {}
        let err: Error | null = null;
        try {
            build((b) => {
                b.register(A, Lifetime.Singleton);
                b.register(B, Lifetime.Singleton);
                b.register(Lonely, Lifetime.Transient);
            }, 'Broken');
        } catch (e) {
            err = e as Error;
        }
        assert.ok(err, 'build throws');
        const m = err!.message;
        assert.match(m, /"Broken"/);
        assert.match(m, /Lonely needs ILogger \(constructor parameter 1\)/);
        assert.match(m, /Lonely needs Speed \(constructor parameter 2\)/);
        assert.match(m, /Circular dependency: A → B → A/);
        assert.ok(![...Container.all].some((c) => c.name === 'Broken'), 'the failed container is disposed');
    });

    await test('errors name the token, the requester and the scope', () => {
        const c = build(() => undefined, 'Empty');
        assert.throws(() => c.resolve(ILogger), /No registration for ILogger, in the scope "Empty"/);
        class View {
            @inject(ILogger) logger!: ILogger;
        }
        assert.throws(() => c.inject(new View()), /needed by View\.logger/);
        assert.throws(() => inject(undefined as any)(class X {}), /circular import/);
    });

    await test('a parent singleton never takes a child registration', () => {
        @inject(Clock) class UsesClock {}
        assert.throws(
            () => build((b) => b.register(UsesClock, Lifetime.Singleton)).createScope((b) => b.register(Clock, Lifetime.Singleton)),
            /UsesClock needs _?Clock/,
        );
    });

    await test('dispose: children first, then instances in reverse order; instances given are kept', () => {
        const order: string[] = [];
        class D1 {
            dispose() {
                order.push('D1');
            }
        }
        @inject(D1) class D2 {
            dispose() {
                order.push('D2');
            }
        }
        class Given {
            dispose() {
                order.push('given');
            }
        }
        class ChildThing {
            dispose() {
                order.push('child');
            }
        }
        const root = build((b) => {
            b.register(D1, Lifetime.Singleton);
            b.register(D2, Lifetime.Singleton);
            b.registerInstance(new Given());
        });
        root.resolve(D2);
        const child = root.createScope((b) => b.register(ChildThing, Lifetime.Scoped));
        child.resolve(ChildThing);
        root.dispose();
        assert.deepStrictEqual(order, ['child', 'D2', 'D1']);
        assert.ok(child.disposed && root.disposed);
        assert.throws(() => root.resolve(D1), /disposed/);
    });

    await test('entry points: order of calls over frames, errors, disposal', async () => {
        const calls: string[] = [];
        class Presenter {
            initialize() { calls.push('initialize'); }
            postInitialize() { calls.push('postInitialize'); }
            start() { calls.push('start'); }
            postStart() { calls.push('postStart'); }
            fixedTick() { calls.push('fixedTick'); }
            tick() { calls.push('tick'); }
            postTick() { calls.push('postTick'); }
            lateTick() { calls.push('lateTick'); }
            postLateTick() { calls.push('postLateTick'); }
            dispose() { calls.push('dispose'); }
        }
        class Broken {
            tick() { throw new Error('boom'); }
        }
        let token = null as CancellationToken | null;
        class Loader {
            async startAsync(ct: CancellationToken) {
                token = ct;
                await new Promise((r) => setTimeout(r, 5));
                ct.throwIfCancelled();
            }
        }
        const errors: unknown[] = [];
        const c = build((b) => {
            b.registerEntryPoint(Broken);
            b.registerEntryPoint(Presenter);
            b.registerEntryPoint(Loader);
            b.registerEntryPointExceptionHandler((e) => errors.push(e));
        });
        assert.deepStrictEqual(calls, ['initialize', 'postInitialize']);
        EntryPoints.beforeUpdate(1 / 60);
        EntryPoints.midUpdate(1 / 60);
        EntryPoints.afterUpdate(1 / 60);
        assert.deepStrictEqual(calls.slice(2), ['start', 'postStart', 'fixedTick', 'tick', 'postTick', 'lateTick', 'postLateTick']);
        assert.strictEqual(errors.length, 1, 'the error went to the handler, the others still ran');
        calls.length = 0;
        EntryPoints.beforeUpdate(2.5 / 60);
        assert.deepStrictEqual(calls, ['fixedTick', 'fixedTick', 'tick'], 'fixed steps catch up');
        assert.ok(token && !token!.isCancelled);
        const errorsBefore = errors.length;
        c.dispose();
        assert.ok(token!.isCancelled, 'startAsync is cancelled with its scope');
        assert.strictEqual(calls[calls.length - 1], 'dispose');
        calls.length = 0;
        EntryPoints.beforeUpdate(1 / 60);
        assert.deepStrictEqual(calls, [], 'no more calls');
        await new Promise((r) => setTimeout(r, 20));
        assert.strictEqual(errors.length, errorsBefore, 'the cancellation is not an error');
    });

    done();
})();
