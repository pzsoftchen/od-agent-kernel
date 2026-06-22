/**
 * HTTP routing types — re-exported from @od-kernel/types for convenience.
 * This file mirrors apps/daemon/src/http/types.ts but with contracts imports
 * resolved through the kernel types package.
 */

export {
  type Result,
  type RouteInputContext,
  type InputParser,
  type Handler,
  type HttpMethod,
  type JsonRouteSpec,
  ok,
  err,
} from '@od-kernel/types';
