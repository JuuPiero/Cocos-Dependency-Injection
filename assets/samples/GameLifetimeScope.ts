/**
 * Sample scope. Add it to a node of the scene, drag the Canvas into Auto
 * Inject Nodes, put a ScoreLabel on a Label, press Play, then open
 * Panel > Injector Diagnostics.
 */
import { _decorator } from 'cc';
import { ContainerBuilder, Lifetime, LifetimeScope } from 'db://injector/index';
import { EditorAds, GamePresenter, IAds, ScoreService } from './Services';

const { ccclass, menu } = _decorator;

@ccclass('GameLifetimeScope')
@menu('Injector/Samples/GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: ContainerBuilder): void {
        builder.register(EditorAds, Lifetime.Singleton).as(IAds);
        builder.register(ScoreService, Lifetime.Singleton);
        builder.registerEntryPoint(GamePresenter);
    }
}
