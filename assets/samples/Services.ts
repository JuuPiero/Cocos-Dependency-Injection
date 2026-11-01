/**
 * Sample services: plain classes, no components (several can share a file).
 * Registered by GameLifetimeScope; ScoreLabel shows the score.
 */
import { inject } from 'db://injector/index';
import type { Disposable, Startable, Tickable } from 'db://injector/index';

/** An "interface": abstract classes exist at runtime, so they can be tokens. */
export abstract class IAds {
    abstract showInterstitial(): Promise<void>;
}

/** The editor's stand-in; a build would register an AdMob / Unity Ads one instead. */
export class EditorAds extends IAds {
    shown = 0;

    async showInterstitial(): Promise<void> {
        this.shown++;
        console.log(`[Ads] (editor) interstitial #${this.shown}`);
    }
}

export class ScoreService {
    score = 0;
    best = 0;

    add(points: number): void {
        this.score += points;
        this.best = Math.max(this.best, this.score);
    }
}

/** Game logic without a node: started and ticked by the scope. */
@inject(IAds, ScoreService)
export class GamePresenter implements Startable, Tickable, Disposable {
    private nextAd = 10;

    constructor(private readonly ads: IAds, private readonly score: ScoreService) {}

    start(): void {
        console.log('[GamePresenter] started');
    }

    tick(dt: number): void {
        this.score.add(dt * 10);
        if (this.score.score >= this.nextAd * 10) {
            this.nextAd += 10;
            this.ads.showInterstitial();
        }
    }

    dispose(): void {
        console.log(`[GamePresenter] disposed (best ${Math.floor(this.score.best)})`);
    }
}
