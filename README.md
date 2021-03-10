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

Branch
------
[master](https://github.com/CreamFi/compound-protocol/tree/master) - deployed on ethereum mainnet

[bsc](https://github.com/CreamFi/compound-protocol/tree/bsc) - deployed on binance smart chain

[cream-v2](https://github.com/CreamFi/compound-protocol/tree/cream-v2) - (ironbank) deployed on ethereum mainnet

[fantom](https://github.com/CreamFi/compound-protocol/tree/fantom) - deployed on fantom opera

Audits
-------
[Trail of Bits](https://github.com/CreamFi/compound-protocol/blob/master/audits/trailofbits-CREAMSummary.pdf)

Change Logs
-----------
Cream Finance forked from this commit [7561dcf5964527dbf2f3c7cd670775b3c6f7e378](https://github.com/compound-finance/compound-protocol/commits/7561dcf5964527dbf2f3c7cd670775b3c6f7e378) of Compound Finance,
Cream continues to add new features and submits pull requests back to Compound as appropriate. Below is a high level summary of the changes:

- Add borrow cap feature, this feature is cherry picked from Compound Finance https://github.com/compound-finance/compound-protocol/pull/65
  * Add a borrow cap check in Comptroller's borrowAllowed hook, disallow further borrowing if an market's totalBorrows reaches its borrow cap

- Add supply cap feature, Implemented in Comptroller.sol, CCapableErc20.sol
  * Add a supply cap check in Comptroller's mintAllowed hook, disallow further minting (supplying) if an market's cash + totalBorrows reaches its supply cap
  * CCapableErc20 tracks cash by itself instead of using balanceOf of underlying token. This avoids direct transfering to cToken to manipulate cash.
  * Need to update cToken's implementation to enable this feature.

- Support earning sushi LP tokens. Implemented in CSLPDelegate.sol
  * CSLP deposit/withdraw sushi lp token to/from sushi MasterChef when doTransferIn/doTrasnferOut
  * Suppliers can use sushi LP tokens as collateral
  * Suppliers can claim sushi reward or borrow interest

- Support claiming COMP earned from holding CTokens. Implemented in CCTokenDelegate.sol
  * CCToken collects Compound reward and supplier can use claimComp function to claim their reward

BSC
- Change comp address
- Update price oracle implementation (Band)

IronBank
- Support protocol to protocol borrowing without collateral, this gives whitelisted protocol borrows up to credit limit without collateral.
   * add credit limit in Comptroller.sol
   * remove repayBorrowBehalf, so that protocol can track their debt easily.
- Patch as part of the update in the Alpha Homora v2 exploit, excluding stolen funds from interest calculation.
  * CToken.sol on cream-v2-no-interest branch
  * Apply on cyWETH, cyUSDC, cyUSDT, cyDAI
