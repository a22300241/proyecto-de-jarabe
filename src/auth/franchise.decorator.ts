import { SetMetadata } from '@nestjs/common';

export const FRANCHISE_PARAM_KEY = 'franchiseParamKey';

/**
 * Indica de dónde sale el franchiseId a validar:
 * - 'params.franchiseId' -> usa @Param('franchiseId')
 * - 'body.franchiseId'   -> usa @Body().franchiseId
 * - 'query.franchiseId'  -> usa ?franchiseId=...
 */
export const FranchiseParam = (path: 'params.franchiseId' | 'body.franchiseId' | 'query.franchiseId') =>
  SetMetadata(FRANCHISE_PARAM_KEY, path);
