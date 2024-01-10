module.exports = {
  // **.astro 同名的属性是否格式化为短格式: <element name={name} /> => <element {name} />
  astroAllowShorthand: false,

  // 是否在每条语句的末尾添加一个分号
  semi: true,
  // 使用单引号
  singleQuote: true,
  // jsx属性 不使用单引号
  jsxSingleQuote: false,
  // 尾随逗号
  trailingComma: 'none',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',

  plugins: [require.resolve('prettier-plugin-astro')],
  overrides: [
    {
      files: ['**/*.astro'],
      options: {
        parser: 'astro'
      }
    },
    {
      files: '*.vue',
      options: {
        parser: 'vue'
      }
    }
  ]
};
