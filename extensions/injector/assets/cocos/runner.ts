/**
 * Drives the entry points from Cocos' frame (see core/entry-points.ts), and
 * names classes by their cc class name in messages (builds minify the rest).
 */
import { director, Director, game, js, Scheduler } from 'cc';
import { DEBUG, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { Container } from '../core/container';
import { EntryPoints } from '../core/entry-points';
import { setClassNameResolver } from '../core/token';

setClassNameResolver((cls) => js.getClassName(cls) || (cls as any).name || 'anonymous class');
Container.trackInjected = !!DEBUG;

if (!EDITOR_NOT_IN_PREVIEW) {
    director.on(Director.EVENT_BEFORE_UPDATE, () => EntryPoints.beforeUpdate(game.deltaTime));
    director.on(Director.EVENT_AFTER_UPDATE, () => EntryPoints.afterUpdate(game.deltaTime));
    // The scheduler updates between the components' update and lateUpdate.
    const between: any = { update: (dt: number) => EntryPoints.midUpdate(dt) };
    Scheduler.enableForTarget(between);
    director.getScheduler().scheduleUpdate(between, -1000, false);
}
