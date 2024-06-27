import { DEFAULT_UTILITY_OPTIONS } from '../constants';
import { Options, ResolvedOptions, ResolvedUtilityOptions, ResolvedVariablesOptions, ScopeOptions, ResolvedScopeOptions } from '../types';

export function resolveOptions(options: Options): ResolvedOptions {
  const lenght = !options.scope ? 8 : typeof options.scope === 'number' ? options.scope as number : (options.scope as ScopeOptions).lenght || 8;
  const scope = typeof options.scope === 'object' ? { ...options.scope, lenght } : { lenght };

  let key = '';

  switch(typeof scope.cssVariables) {
    case 'boolean':
      key = scope.cssVariables ? '/' : '';
    break;
    case 'string':
      key = scope.cssVariables as string;
    break;
    case 'object':
      key = scope.cssVariables.key || '/';
    break;
  }

  const cssVariables: ResolvedVariablesOptions = {
    ...typeof scope.cssVariables === 'object' ? scope.cssVariables : {},
    key,
  };

  return {
    test: options.test || {},
    scope: { ...scope, cssVariables } as ResolvedScopeOptions,
    modules: !!options.modules,
    utility: options.utility ? typeof options.utility === 'boolean' ? DEFAULT_UTILITY_OPTIONS : {
      ...DEFAULT_UTILITY_OPTIONS,
      ...options.utility as Partial<ResolvedUtilityOptions>,
    } as ResolvedUtilityOptions: false,
    getModules: options.getModules || (() => {}),
  };
}
