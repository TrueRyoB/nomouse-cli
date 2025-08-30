# [Nomouse CLI](https://github.com/TrueRyoB/nomouse-cli)
ファイルの作成・実行・コピーを迅速に抽象化したCLIです。<br>
~~~:node.jsを利用することでインストールが可能です。
npm -i nomouse-cli
~~~

## コマンド
**Gen**: テンプレートに則した新しいファイルを作成
~~~
nyn gen $filename.$extension
~~~
**Set**: 拡張子に応じたテンプレートを設定
~~~
nyn set $extension
~~~
**Run**: コンパイルして実行
~~~
nyn run $filename.$extension
~~~
**Wind**: 最後にnomouse-cliを通じて作成/実行されたファイルのコードをClipboardに保存
~~~
nyn wind
~~~
**Status**: Nomouse CLIの使用状況を表示
~~~
nyn status
~~~


## ライセンス
MIT License