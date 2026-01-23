import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Keep strict for unused vars, but allow underscore-prefixed names
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Require explicit return types for public API clarity
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],

      // No any types
      '@typescript-eslint/no-explicit-any': 'error',

      // Boolean expressions - allow common JS patterns
      '@typescript-eslint/strict-boolean-expressions': 'off',

      // Promise handling - keep strict
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Allow numbers, booleans, and nullish in template literals (with runtime checks)
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowNumber: true,
        allowBoolean: true,
        allowNullish: true,
        allowRegExp: false,
      }],

      // Disable unsafe rules for patterns that are intentional
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // Other relaxations
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-deprecated': 'warn', // Warn instead of error

      // Disable overly pedantic rules
      '@typescript-eslint/no-redundant-type-constituents': 'off', // Intentional for self-documenting types
      '@typescript-eslint/no-unnecessary-condition': 'off', // Too many false positives
      '@typescript-eslint/prefer-readonly': 'off', // Nice but not critical
      '@typescript-eslint/non-nullable-type-assertion-style': 'off', // Prefer explicit assertions
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow when developer knows better
      '@typescript-eslint/consistent-indexed-object-style': 'off', // Allow both styles
      '@typescript-eslint/array-type': 'off', // Allow both Array<T> and T[]
      '@typescript-eslint/prefer-for-of': 'off', // Allow traditional for loops
      '@typescript-eslint/no-unnecessary-type-arguments': 'off', // Explicit is fine
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', // Allow explicit assertions
      '@typescript-eslint/consistent-generic-constructors': 'off', // Allow both styles
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Allow ||
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off', // Allow error: Error
      '@typescript-eslint/require-await': 'off', // Allow async without await for interface consistency
      '@typescript-eslint/no-unnecessary-type-parameters': 'off', // Allow explicit type params
      '@typescript-eslint/restrict-plus-operands': 'off', // Allow string concatenation patterns
    },
  },
  // Relaxed rules for test files
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Tests often need any for mocking
      '@typescript-eslint/explicit-function-return-type': 'off', // Test functions don't need return types
      '@typescript-eslint/no-unused-vars': 'off', // Tests may have unused setup code
      '@typescript-eslint/no-unnecessary-type-conversion': 'off', // Tests may be explicit for clarity
      '@typescript-eslint/prefer-regexp-exec': 'off', // Allow match() in tests
      '@typescript-eslint/no-empty-function': 'off', // Allow empty callbacks in tests
      '@typescript-eslint/prefer-promise-reject-errors': 'off', // Allow non-Error rejections in tests
      '@typescript-eslint/restrict-template-expressions': 'off', // Allow flexible templates in tests
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.ts', '*.config.js', 'examples/**'],
  }
);
