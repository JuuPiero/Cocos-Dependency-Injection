/**
 * Sample component: gets ScoreService from the scope (injected before
 * onLoad when its node is under one of the scope's Auto Inject Nodes).
 */
import { _decorator, Component, Label } from 'cc';
import { inject } from 'db://injector/index';
import { ScoreService } from './Services';

const { ccclass, menu, requireComponent } = _decorator;

@ccclass('ScoreLabel')
@menu('Injector/Samples/ScoreLabel')
@requireComponent(Label)
export class ScoreLabel extends Component {
    @inject(ScoreService) score!: ScoreService;

    private label: Label | null = null;

    onLoad() {
        this.label = this.getComponent(Label);
        if (!this.score) console.warn('[ScoreLabel] Not injected: put this node under an Auto Inject Node of a LifetimeScope.');
    }

    update() {
        if (this.label && this.score) this.label.string = `Score: ${Math.floor(this.score.score)}  Best: ${Math.floor(this.score.best)}`;
    }
}
