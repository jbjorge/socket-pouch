const path = require('path');

module.exports = {
  entry: './src/client/index.js',
  output: {
    filename: 'socket-pouch.client.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'eslint-loader',
        options: { fix: true }
      },
    ],
  }
};