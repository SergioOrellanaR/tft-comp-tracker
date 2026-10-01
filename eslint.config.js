import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['Scripts/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['tests/**/*.js', 'eslint.config.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    },
];
