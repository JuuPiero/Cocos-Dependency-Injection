/**
 * Injector Diagnostics (Panel > Injector Diagnostics): the scopes,
 * registrations and instances of a running game.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDiagnosticsApp, DiagnosticsApp } from './app';
import { editorBridge } from './bridge';

const CSS = readFileSync(join(__dirname, '../../static/style/panel.css'), 'utf8');

const apps = new WeakMap<object, DiagnosticsApp>();

module.exports = Editor.Panel.define({
    template: '<div id="app"></div>',
    style: CSS,
    $: { app: '#app' },
    methods: {},
    ready() {
        apps.set(this, createDiagnosticsApp((this as any).$.app as HTMLElement, editorBridge()));
    },
    close() {
        apps.get(this)?.dispose();
    },
});
