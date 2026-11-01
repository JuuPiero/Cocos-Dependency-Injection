/**
 * @inject marks what a class needs (VContainer's [Inject]):
 *
 *     @inject(IAds, GameConfig)                  // constructor parameters, in order
 *     export class GamePresenter {
 *         constructor(private ads: IAds, private config: GameConfig) {}
 *     }
 *
 *     export class ShopView extends Component {
 *         @inject(IAds) ads!: IAds;                // field
 *         @inject(optional(IAnalytics)) analytics?: IAnalytics;
 *         @inject(all(IShopItem)) items!: IShopItem[];
 *
 *         @inject(AudioService, SaveService)     // method, called after the fields
 *         construct(audio: AudioService, save: SaveService) {}
 *     }
 *
 * TypeScript in Cocos keeps no parameter types at runtime, so tokens are
 * always written out. `@inject(() => Foo)` is a forward reference for
 * classes not yet defined when the decorator runs (circular imports).
 */
import { classNameOf, Dependency, InjectArg, isToken, isForwardRef, toDependency } from './token';

export interface FieldPoint {
    key: string;
    dep: Dependency;
}

export interface MethodPoint {
    key: string;
    deps: Dependency[];
}

interface OwnInfo {
    ctor: Dependency[] | null;
    fields: FieldPoint[];
    methods: MethodPoint[];
}

/** Everything a class (with its base classes) asks for. */
export interface InjectionInfo {
    /** Constructor parameters (the nearest class that declares them), or null: `new T()`. */
    ctor: Dependency[] | null;
    /** Base classes' fields first. */
    fields: FieldPoint[];
    /** Base classes' methods first; an override is called once. */
    methods: MethodPoint[];
    /** False when nothing is injected (fast skip). */
    any: boolean;
}

const own = new Map<Function, OwnInfo>();
const merged = new Map<Function, InjectionInfo>();

function ownInfo(cls: Function): OwnInfo {
    let info = own.get(cls);
    if (!info) own.set(cls, (info = { ctor: null, fields: [], methods: [] }));
    merged.clear();
    return info;
}

function checkArgs(args: InjectArg[], where: () => string): Dependency[] {
    return args.map((a, i) => {
        const d = toDependency(a);
        if (!isToken(d.token) && !isForwardRef(d.token)) {
            throw new Error(
                `[Injector] @inject on ${where()}: argument ${i + 1} is ${String(d.token)}. ` +
                'This usually means a circular import: write @inject(() => TheClass) instead.',
            );
        }
        return d;
    });
}

/** Marks constructor parameters (on a class), a method's parameters, or one field. */
export function inject(...args: InjectArg[]) {
    return function (target: any, key?: string | symbol, desc?: any): any {
        if (key === undefined) {
            ownInfo(target).ctor = checkArgs(args, () => classNameOf(target));
            return;
        }
        if (typeof target === 'function') throw new Error(`[Injector] @inject on static ${String(key)} is not supported.`);
        const cls = target.constructor;
        const where = () => `${classNameOf(cls)}.${String(key)}`;
        const deps = checkArgs(args, where);
        if (desc && typeof desc.value === 'function') {
            ownInfo(cls).methods.push({ key: String(key), deps });
            return;
        }
        if (deps.length !== 1) throw new Error(`[Injector] @inject on the field ${where()} takes one token.`);
        ownInfo(cls).fields.push({ key: String(key), dep: deps[0] });
    };
}

/** The injection points of a class and its bases (cached). */
export function injectionInfo(cls: Function): InjectionInfo {
    let info = merged.get(cls);
    if (info) return info;
    const chain: Function[] = [];
    for (let c: any = cls; c && c !== Function.prototype && c !== Object; c = Object.getPrototypeOf(c)) chain.unshift(c);
    info = { ctor: null, fields: [], methods: [], any: false };
    const methodIndex = new Map<string, number>();
    for (const c of chain) {
        const o = own.get(c);
        if (!o) continue;
        if (o.ctor) info.ctor = o.ctor;
        info.fields.push(...o.fields);
        for (const m of o.methods) {
            const i = methodIndex.get(m.key);
            if (i === undefined) {
                methodIndex.set(m.key, info.methods.length);
                info.methods.push(m);
            } else {
                info.methods[i] = m;
            }
        }
    }
    info.any = !!info.ctor || info.fields.length > 0 || info.methods.length > 0;
    merged.set(cls, info);
    return info;
}

/** Every dependency of a class: constructor, fields, methods. */
export function dependenciesOf(cls: Function): { dep: Dependency; point: string }[] {
    const info = injectionInfo(cls);
    const out: { dep: Dependency; point: string }[] = [];
    (info.ctor || []).forEach((dep, i) => out.push({ dep, point: `constructor parameter ${i + 1}` }));
    for (const f of info.fields) out.push({ dep: f.dep, point: `field "${f.key}"` });
    for (const m of info.methods) m.deps.forEach((dep, i) => out.push({ dep, point: `${m.key}() parameter ${i + 1}` }));
    return out;
}
