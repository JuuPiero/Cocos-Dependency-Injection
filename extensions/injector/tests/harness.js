"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.results = void 0;
exports.test = test;
exports.done = done;
const assert_1 = __importDefault(require("assert"));
exports.results = { passed: 0, failed: 0, skipped: 0 };
async function test(name, fn) {
    try {
        await fn();
        exports.results.passed++;
        console.log(`  ok   ${name}`);
    }
    catch (e) {
        exports.results.failed++;
        const err = e;
        const detail = err instanceof assert_1.default.AssertionError ? err.message : String((err === null || err === void 0 ? void 0 : err.stack) || err).split('\n').slice(0, 6).join('\n');
        console.log(`  FAIL ${name}\n       ${detail.split('\n').join('\n       ')}`);
    }
}
function done() {
    console.log(`\n  ${exports.results.passed} passed, ${exports.results.failed} failed`);
    process.exitCode = exports.results.failed ? 1 : 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFybmVzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImhhcm5lc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBSUEsb0JBV0M7QUFFRCxvQkFHQztBQXBCRCxvREFBNEI7QUFFZixRQUFBLE9BQU8sR0FBRyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFFckQsS0FBSyxVQUFVLElBQUksQ0FBQyxJQUFZLEVBQUUsRUFBOEI7SUFDbkUsSUFBSSxDQUFDO1FBQ0QsTUFBTSxFQUFFLEVBQUUsQ0FBQztRQUNYLGVBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNULGVBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNqQixNQUFNLEdBQUcsR0FBRyxDQUFVLENBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQUcsR0FBRyxZQUFZLGdCQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsS0FBSyxLQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxZQUFZLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNsRixDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQWdCLElBQUk7SUFDaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLGVBQU8sQ0FBQyxNQUFNLFlBQVksZUFBTyxDQUFDLE1BQU0sU0FBUyxDQUFDLENBQUM7SUFDdEUsT0FBTyxDQUFDLFFBQVEsR0FBRyxlQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM5QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5leHBvcnQgY29uc3QgcmVzdWx0cyA9IHsgcGFzc2VkOiAwLCBmYWlsZWQ6IDAsIHNraXBwZWQ6IDAgfTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRlc3QobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBmbigpO1xuICAgICAgICByZXN1bHRzLnBhc3NlZCsrO1xuICAgICAgICBjb25zb2xlLmxvZyhgICBvayAgICR7bmFtZX1gKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJlc3VsdHMuZmFpbGVkKys7XG4gICAgICAgIGNvbnN0IGVyciA9IGUgYXMgRXJyb3I7XG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGVyciBpbnN0YW5jZW9mIGFzc2VydC5Bc3NlcnRpb25FcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycj8uc3RhY2sgfHwgZXJyKS5zcGxpdCgnXFxuJykuc2xpY2UoMCwgNikuam9pbignXFxuJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIEZBSUwgJHtuYW1lfVxcbiAgICAgICAke2RldGFpbC5zcGxpdCgnXFxuJykuam9pbignXFxuICAgICAgICcpfWApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRvbmUoKSB7XG4gICAgY29uc29sZS5sb2coYFxcbiAgJHtyZXN1bHRzLnBhc3NlZH0gcGFzc2VkLCAke3Jlc3VsdHMuZmFpbGVkfSBmYWlsZWRgKTtcbiAgICBwcm9jZXNzLmV4aXRDb2RlID0gcmVzdWx0cy5mYWlsZWQgPyAxIDogMDtcbn1cbiJdfQ==