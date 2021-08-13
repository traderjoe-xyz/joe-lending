pragma solidity ^0.5.16;

import "../../contracts/InterestRateModel.sol";

/**
 * @title An Interest Rate Model for tests that can be instructed to return a failure instead of doing a calculation
 * @author Compound
 */
contract InterestRateModelHarness is InterestRateModel {
    uint256 public constant opaqueBorrowFailureCode = 20;
    bool public failBorrowRate;
    uint256 public borrowRate;

    constructor(uint256 borrowRate_) public {
        borrowRate = borrowRate_;
    }

    function setFailBorrowRate(bool failBorrowRate_) public {
        failBorrowRate = failBorrowRate_;
    }

    function setBorrowRate(uint256 borrowRate_) public {
        borrowRate = borrowRate_;
    }

    function getBorrowRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) public view returns (uint256) {
        _cash; // unused
        _borrows; // unused
        _reserves; // unused
        require(!failBorrowRate, "INTEREST_RATE_MODEL_ERROR");
        return borrowRate;
    }

    function getSupplyRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves,
        uint256 _reserveFactor
    ) external view returns (uint256) {
        _cash; // unused
        _borrows; // unused
        _reserves; // unused
        return borrowRate * (1 - _reserveFactor);
    }
}
