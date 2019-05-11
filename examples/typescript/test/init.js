require('@babel/register')({
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  plugins: ['mockable-imports'],
});
