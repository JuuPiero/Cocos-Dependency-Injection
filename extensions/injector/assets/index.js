"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosticsConnected = exports.diagnosticsAnswer = exports.DIAGNOSTICS_PORTS = exports.ROOT_SCOPE_PATH = exports.LifetimeScope = exports.findComponent = exports.ComponentRegistrationBuilder = void 0;
// Dependency injection for Cocos Creator (VContainer style): import from 'db://injector/index'.
__exportStar(require("./core"), exports);
require("./cocos/runner");
var nodes_1 = require("./cocos/nodes");
Object.defineProperty(exports, "ComponentRegistrationBuilder", { enumerable: true, get: function () { return nodes_1.ComponentRegistrationBuilder; } });
Object.defineProperty(exports, "findComponent", { enumerable: true, get: function () { return nodes_1.findComponent; } });
var lifetime_scope_1 = require("./cocos/lifetime-scope");
Object.defineProperty(exports, "LifetimeScope", { enumerable: true, get: function () { return lifetime_scope_1.LifetimeScope; } });
Object.defineProperty(exports, "ROOT_SCOPE_PATH", { enumerable: true, get: function () { return lifetime_scope_1.ROOT_SCOPE_PATH; } });
var agent_1 = require("./debug/agent");
Object.defineProperty(exports, "DIAGNOSTICS_PORTS", { enumerable: true, get: function () { return agent_1.DIAGNOSTICS_PORTS; } });
Object.defineProperty(exports, "diagnosticsAnswer", { enumerable: true, get: function () { return agent_1.diagnosticsAnswer; } });
Object.defineProperty(exports, "diagnosticsConnected", { enumerable: true, get: function () { return agent_1.diagnosticsConnected; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdHQUFnRztBQUNoRyx5Q0FBdUI7QUFDdkIsMEJBQXdCO0FBQ3hCLHVDQUE0RTtBQUFuRSxxSEFBQSw0QkFBNEIsT0FBQTtBQUFFLHNHQUFBLGFBQWEsT0FBQTtBQUNwRCx5REFBd0U7QUFBL0QsK0dBQUEsYUFBYSxPQUFBO0FBQUUsaUhBQUEsZUFBZSxPQUFBO0FBQ3ZDLHVDQUEyRjtBQUFsRiwwR0FBQSxpQkFBaUIsT0FBQTtBQUFFLDBHQUFBLGlCQUFpQixPQUFBO0FBQUUsNkdBQUEsb0JBQW9CLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBEZXBlbmRlbmN5IGluamVjdGlvbiBmb3IgQ29jb3MgQ3JlYXRvciAoVkNvbnRhaW5lciBzdHlsZSk6IGltcG9ydCBmcm9tICdkYjovL2luamVjdG9yL2luZGV4Jy5cbmV4cG9ydCAqIGZyb20gJy4vY29yZSc7XG5pbXBvcnQgJy4vY29jb3MvcnVubmVyJztcbmV4cG9ydCB7IENvbXBvbmVudFJlZ2lzdHJhdGlvbkJ1aWxkZXIsIGZpbmRDb21wb25lbnQgfSBmcm9tICcuL2NvY29zL25vZGVzJztcbmV4cG9ydCB7IExpZmV0aW1lU2NvcGUsIFJPT1RfU0NPUEVfUEFUSCB9IGZyb20gJy4vY29jb3MvbGlmZXRpbWUtc2NvcGUnO1xuZXhwb3J0IHsgRElBR05PU1RJQ1NfUE9SVFMsIGRpYWdub3N0aWNzQW5zd2VyLCBkaWFnbm9zdGljc0Nvbm5lY3RlZCB9IGZyb20gJy4vZGVidWcvYWdlbnQnO1xuIl19