import path from 'node:path';

import { type Alias, createLogger, type Logger, type LogLevel, mergeConfig, type ModuleNode, type Plugin as VitePlugin, type UserConfig } from 'vite';

import { compile } from './compile.js';
import { load } from './load.js';
import { type Result } from './result.js';
import { cleanUrl } from './utils/clean-url.js';
import { isGlobMatch } from './utils/is-glob-match.js';
import { normalizeGlobs } from './utils/normalize-globs.js';

/**
 * Plugin interface exported by the vite-plugin-data plugin.
 */
export interface Plugin extends VitePlugin {
  /**
   * Uses the `logger`, `logLevel`, `root`, and `resolve.alias` config.
   */
  configResolved(config: {
    logger: Pick<Logger, 'info'>;
    logLevel?: LogLevel;
    root: string;
    resolve: {
      alias: readonly Alias[];
    };
  }): void;

  /**
   * Loads and compiles data loader files.
   */
  load(id: string): Promise<{ code: string; moduleSideEffects: false } | void>;

  /**
   * Invalidates additional modules based on data loader imports/requires and
   * config comment dependencies.
   */
  handleHotUpdate(ctx: {
    file: string;
    modules: ModuleNode[];
    server: {
      moduleGraph: {
        getModuleById(id: string): ModuleNode | undefined;
      };
    };
  }): ModuleNode[];
}

/**
 * Options for the vite-plugin-data plugin.
*/
export interface Options {
  /**
   * Glob paths to ignore. By default, all files inside `node_modules`
   * directories are ignored.
   */
  ignore?: string[];

  /**
   * Provide a custom Vite configuration to use when transpiling data loaders.
   */
  config?: UserConfig;
}

/**
 * A Vite plugin that resolves the exports of data loader files at build-time
 * and replaces the original file source with the pre-resolved exports.
 */
export const plugin = ({ ignore = [], config: customConfig = {} }: Options = {}): Plugin => {
  /**
   * The `logger` from the resolved configuration.
   */
  let logger: Pick<Logger, 'info'> = createLogger();

  /**
   * The `logLevel` from the resolved configuration.
   */
  let logLevel: LogLevel | undefined;

  /**
   * The `root` from the resolved configuration.
   */
  let root: string;

  /**
   * The `resolve.alias` from the resolved configuration.
   */
  let alias: readonly Alias[];

  /**
   * Absolute ignore patterns which are normalized to the `config.root`.
   */
  let ignorePatterns: string[] = [];

  /**
   * Log a prefixed info message.
   */
  const info = (message: string): void => {
    logger.info(`[vite-plugin-data] ${message}`);
  };

  /**
   * Map of data loader module IDs to loaded results.
   */
  const results = new Map<string, Result>();

  return {
    name: 'vite-plugin-data',
    enforce: 'pre',
    configResolved(config) {
      logger = config.logger;
      logLevel = config.logLevel;
      root = config.root;
      alias = config.resolve.alias;
      ignorePatterns = normalizeGlobs(ignore, config.root);
    },
    async load(id) {
      // The ID is not an absolute file path.
      if (!path.isAbsolute(id)) return;

      // Strip query parameters from the ID (not used).
      id = cleanUrl(id);

      // The ID matches an ignore pattern.
      if (isGlobMatch(id, ['**/node_modules/**', ...ignorePatterns])) return;

      // The ID does not end with a data loader extension.
      if (!/\.data\.(?:js|cjs|mjs|ts|cts|mts)$/iu.test(id)) return;

      info(path.relative(root, id));

      const config = mergeConfig({
        logLevel: logLevel === undefined || logLevel === 'info' ? 'warn' : logLevel,
        root,
        resolve: { alias },
      }, customConfig);
      const result = await load(id, config);
      const code = await compile(result.exports);

      results.set(id, result);

      return { code, moduleSideEffects: false };
    },
    handleHotUpdate(ctx) {
      /**
       * Modules that should be invalidated to trigger HMR.
       */
      const invalidate = new Set(ctx.modules);

      // Add modules that should be invalidate based on result dependencies.
      for (const [id, result] of results.entries()) {
        if (result.dependsOn(ctx.file)) {
          invalidate.add(ctx.server.moduleGraph.getModuleById(id)!);
        }
      }

      return Array.from(invalidate);
    },
  };
};
