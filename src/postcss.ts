import { resolveOptions, generateHash, countAncestors, processRules } from './utils';
import { ANIMATION_NAME_RE, CLASS_NAME_RE, GLOBAL_ANIMATION_RE } from './constants';
import { AtRule, type PluginCreator, type Rule } from 'postcss';
import { Options, ResolvedUtilityOptions } from './types';

// Create the plugin
export const plugin: PluginCreator<Options> = (options: Options = {}) => {
  // Set default options if necessary
  const opts = resolveOptions(options);
  const getScope = (...args: string[]) => `_${generateHash(opts.scopeLength, ...args)}`;

  return {
    postcssPlugin: 'postcss-utility-modules',
    // The Once method is called once for the root node at the end of the processing
    async Once(root, { result }) {
      const filePath = result.opts.from || 'unknown';
      const css = root.toString();
      // Object to store original class names and their suffixed names (modules)
      const modules: Record<string, string> = {};
      // Object to store original animation names and their suffixed names (modules)
      let hasKeyframes = false;
      const keyframes: Record<string, string> = {};
      // Object to store original CSS variable names and their suffixed names
      let hasScopedVars = false;
      const cssVarModules: Record<string, string> = {};
      // Object to store utility class name and its own css
      const utilityModules: Record<string, Rule | AtRule> = {};
      // Set of classNames already processed for the utility functionality
      // const processedClasses: Set<string> = new Set();
      const rules: Record<string, { ancestors: number, rule: Rule | AtRule}[]> = {};

      if (!opts.modules && opts.scopedCSSVariables && opts.utility) return;
      // Generate a unique suffix for this file
      const suffix = getScope(css);

      root.walkRules(rule => {
        if (rule.selector === ':root' && opts.scopedCSSVariables) {
          // Generate unique id scope for CSS variables in :root
          rule.walkDecls(decl => {
            if (!decl.prop.startsWith('--')) return;
            
            const originalProp = decl.prop;
            const suffixedProp = `${originalProp}${getScope(opts.scopedCSSVariables)}`;
            cssVarModules[originalProp] = suffixedProp;
            decl.prop = suffixedProp;
          });

          hasScopedVars = true;
        } else {
          const scopedVars = opts.scopedCSSVariables && hasScopedVars;

          if (opts.modules || scopedVars) {
            rule.walkDecls(decl => {
              if (decl.prop === 'animation' || decl.prop === 'animation-name') {
                let animations: string[] = [];
                
                if (decl.prop === 'animation') {
                  animations = decl.value
                    .split(',')
                    .map(a => a.trim().match(ANIMATION_NAME_RE)![0])
                } else if (decl.prop === 'animation-name') {
                  animations.push(decl.value);
                }

                if (animations.length) {
                  animations.forEach(a => {
                    const suffixed = !GLOBAL_ANIMATION_RE.test(a);
                    const name = suffixed ? `${a}${suffix}` : a.replace(GLOBAL_ANIMATION_RE, '');
                    decl.value = decl.value.replace(new RegExp(suffixed ? a : `global\\(${name}\\)`, 'g'), name);
                    
                    if (suffixed && !keyframes[a]) keyframes[a] = name;
                  });
                }

                hasKeyframes = true;
              }

              if (scopedVars) {
                // Process declarations to suffix CSS variables in var() functions
                decl.value = decl.value.replace(/var\((--[\w-]+)\)/g, (match, cssVar) => {
                  const suffixedVar = cssVarModules[cssVar] || cssVar;
                  return `var(${suffixedVar})`;
                });
              }
            });
          }

          if (opts.modules) {
            // Add a suffix to each class name if not preceded by :global
            rule.selectors = rule.selectors.map(selector =>
              selector.replace(CLASS_NAME_RE, (match, prefix, globalContent, globalClassName, className) => {
                if (globalContent) return globalContent; // Return just the class name without :global
                if (globalClassName) return `.${globalClassName}`; // Return just the class name without :global
                if (!className) return match;

                const suffixedClassName = `${className}${suffix}`;
                if (!modules[className]) modules[className] = suffixedClassName;
                return `.${suffixedClassName}`;
              })
            );
          }

          // store rules must be processed for utility
          if (opts.utility) {
            if (!rule.selector.startsWith('.')) return;
            
            rules[rule.selector] = rules[rule.selector] || [];
            rules[rule.selector].push({ ancestors: countAncestors(rule), rule });
          }
        }
      });

      root.walkAtRules(rule => {
        // Apply suffixed names to keyframes rules
        if (opts.modules && rule.name === 'keyframes' && hasKeyframes) {
          const originalName = rule.params;
          if (!keyframes[originalName]) return;
          rule.params = keyframes[originalName];
          return;
        }

        if (
          opts.utility &&
          ((opts.utility as ResolvedUtilityOptions).media || (opts.utility as ResolvedUtilityOptions).container) &&
          (rule.name === 'media' || rule.name === 'container'))
        {
          const ancestors = countAncestors(rule);
          // skip AtRules at the root level
          if (!ancestors) return;
          
          const { media, container } = opts.utility as ResolvedUtilityOptions;
          
          if (media && rule.name !== 'media') return;
          if (container && rule.name !== 'container') return;
          
          rules[rule.params] = rules[rule.params] || [];
          rules[rule.params].push({ ancestors, rule });
        }
      });

      if (opts.utility) {
        const utility = opts.utility as ResolvedUtilityOptions;
        const { mode, output, getUtilityModules } = utility;

        // Process rules from the deepest
        for (const key of Object.keys(rules).reverse()) {
          const sorted = rules[key].sort((a, b) => a.ancestors - b.ancestors);
          const [ lower ] = sorted;
          const selected: (Rule | AtRule)[] = [];
          
          for (const { ancestors, rule } of sorted) {
            if (ancestors > lower.ancestors) break;
            selected.push(rule);
          }
          
          const isAtRule = lower.rule instanceof AtRule;
          const selector = isAtRule ?
            ((lower.rule as AtRule).parent as Rule).selector :
            (lower.rule as Rule).selector;
          
          processRules(selector, isAtRule, selected, mode, modules, utilityModules);
        }
        
        if (output) Object.values(utilityModules).forEach(rule => root.append(rule));
        
        if (getUtilityModules) {
          const uModules = Object.entries(utilityModules).reduce((acc, [className, rule]) => ({ ...acc, [className]: rule.toString() }), {});
          await getUtilityModules(filePath, uModules);
        }
      }

      if (opts.modules || opts.utility) {
        await opts.getModules(filePath, modules);
      }
    },
  };
};

// Set the plugin name
plugin.postcss = true;