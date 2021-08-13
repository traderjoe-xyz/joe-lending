pragma solidity ^0.5.16;

import "../../../contracts/CErc20Delegate.sol";
import "../../../contracts/EIP20Interface.sol";

import "./CTokenCollateral.sol";

contract CErc20DelegateCertora is CErc20Delegate {
    CTokenCollateral public otherToken;

    function mintFreshPub(address minter, uint256 mintAmount) public returns (uint256) {
        (uint256 error, ) = mintFresh(minter, mintAmount, false);
        return error;
    }

    function redeemFreshPub(
        address payable redeemer,
        uint256 redeemTokens,
        uint256 redeemUnderlying
    ) public returns (uint256) {
        return redeemFresh(redeemer, redeemTokens, redeemUnderlying, false);
    }

    function borrowFreshPub(address payable borrower, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(borrower, borrowAmount, false);
    }

    function repayBorrowFreshPub(
        address payer,
        address borrower,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 error, ) = repayBorrowFresh(payer, borrower, repayAmount, false);
        return error;
    }

    function liquidateBorrowFreshPub(
        address liquidator,
        address borrower,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 error, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, otherToken, false);
        return error;
    }
}
