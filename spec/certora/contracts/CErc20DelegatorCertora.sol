pragma solidity ^0.5.16;

import "../../../contracts/CErc20Delegator.sol";
import "../../../contracts/EIP20Interface.sol";

import "./CTokenCollateral.sol";

contract CErc20DelegatorCertora is CErc20Delegator {
    CTokenCollateral public otherToken;

    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        address implementation_,
        bytes memory becomeImplementationData
    )
        public
        CErc20Delegator(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            implementation_,
            becomeImplementationData
        )
    {
        comptroller; // touch for Certora slot deduction
        interestRateModel; // touch for Certora slot deduction
    }

    function balanceOfInOther(address account) public view returns (uint256) {
        return otherToken.balanceOf(account);
    }

    function borrowBalanceStoredInOther(address account) public view returns (uint256) {
        return otherToken.borrowBalanceStored(account);
    }

    function exchangeRateStoredInOther() public view returns (uint256) {
        return otherToken.exchangeRateStored();
    }

    function getCashInOther() public view returns (uint256) {
        return otherToken.getCash();
    }

    function getCashOf(address account) public view returns (uint256) {
        return EIP20Interface(underlying).balanceOf(account);
    }

    function getCashOfInOther(address account) public view returns (uint256) {
        return otherToken.getCashOf(account);
    }

    function totalSupplyInOther() public view returns (uint256) {
        return otherToken.totalSupply();
    }

    function totalBorrowsInOther() public view returns (uint256) {
        return otherToken.totalBorrows();
    }

    function totalReservesInOther() public view returns (uint256) {
        return otherToken.totalReserves();
    }

    function underlyingInOther() public view returns (address) {
        return otherToken.underlying();
    }

    function mintFreshPub(address minter, uint256 mintAmount) public returns (uint256) {
        bytes memory data = delegateToImplementation(
            abi.encodeWithSignature("_mintFreshPub(address,uint256)", minter, mintAmount)
        );
        return abi.decode(data, (uint256));
    }

    function redeemFreshPub(
        address payable redeemer,
        uint256 redeemTokens,
        uint256 redeemUnderlying
    ) public returns (uint256) {
        bytes memory data = delegateToImplementation(
            abi.encodeWithSignature(
                "_redeemFreshPub(address,uint256,uint256)",
                redeemer,
                redeemTokens,
                redeemUnderlying
            )
        );
        return abi.decode(data, (uint256));
    }

    function borrowFreshPub(address payable borrower, uint256 borrowAmount) public returns (uint256) {
        bytes memory data = delegateToImplementation(
            abi.encodeWithSignature("_borrowFreshPub(address,uint256)", borrower, borrowAmount)
        );
        return abi.decode(data, (uint256));
    }

    function repayBorrowFreshPub(
        address payer,
        address borrower,
        uint256 repayAmount
    ) public returns (uint256) {
        bytes memory data = delegateToImplementation(
            abi.encodeWithSignature("_repayBorrowFreshPub(address,address,uint256)", payer, borrower, repayAmount)
        );
        return abi.decode(data, (uint256));
    }

    function liquidateBorrowFreshPub(
        address liquidator,
        address borrower,
        uint256 repayAmount
    ) public returns (uint256) {
        bytes memory data = delegateToImplementation(
            abi.encodeWithSignature(
                "_liquidateBorrowFreshPub(address,address,uint256)",
                liquidator,
                borrower,
                repayAmount
            )
        );
        return abi.decode(data, (uint256));
    }
}
