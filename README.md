[![CircleCI](https://circleci.com/gh/CreamFi/compound-protocol.svg?style=svg)](https://circleci.com/gh/CreamFi/compound-protocol)

Cream Finance
=================
C.R.E.A.M. Finance is a blockchain agnostic, decentralized peer to peer lending platform based on a fork of [Compound Finance](https://compound.finance).

C.R.E.A.M. bridges liquidity across underserved assets by providing algorithmic money markets to these underserved assets. Users can supply any supported assets and use these supplied assets as collateral to borrow any other supported assets. C.R.E.A.M. has launched on Ethereum and Binance Smart Chain.

Before getting started with this repo, please read the [Compound protocol](https://github.com/compound-finance/compound-protocol) repo

Installation
------------

    git clone https://github.com/CreamFi/compound-protocol
    cd compound-protocol
    yarn install --lock-file # or `npm install`

Building
------
    yarn compile

Testing
-------
Jest contract tests are defined under the [tests directory](https://github.com/compound-finance/compound-protocol/tree/master/tests). To run the tests run:

    yarn test
