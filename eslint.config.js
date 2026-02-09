module.exports = [
  {
    ignores: ['dist', 'node_modules', '.env'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      'prettier': require('eslint-plugin-prettier')
    },
    rules: {
      'prettier/prettier': 'error'
    }
  }
];
