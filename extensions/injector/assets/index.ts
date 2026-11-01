// Dependency injection for Cocos Creator (VContainer style): import from 'db://injector/index'.
export * from './core';
import './cocos/runner';
export { ComponentRegistrationBuilder, findComponent } from './cocos/nodes';
export { LifetimeScope, ROOT_SCOPE_PATH } from './cocos/lifetime-scope';
export { DIAGNOSTICS_PORTS, diagnosticsAnswer, diagnosticsConnected } from './debug/agent';
