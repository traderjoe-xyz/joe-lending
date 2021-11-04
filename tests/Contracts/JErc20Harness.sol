pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/JErc20Immutable.sol";
import "../../contracts/JErc20Delegator.sol";
import "../../contracts/JErc20Delegate.sol";
import "../../contracts/JJLPDelegate.sol";
import "../../contracts/JJTokenDelegate.sol";
import "../../contracts/JCollateralCapErc20Delegate.sol";
import "../../contracts/JCollateralCapErc20Delegator.sol";
import "../../contracts/JWrappedNativeDelegate.sol";
import "../../contracts/JWrappedNativeDelegator.sol";
import "./JoetrollerScenario.sol";

contract JErc20Harness is JErc20Immutable {
    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    )
        public
        JErc20Immutable(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_
        )
    {}

    function doTransferOut(
        address payable to,
        uint256 amount,
        bool isNative
    ) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount, isNative);
    }

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount, false);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount, false);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount, false);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, false);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, false);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract JErc20Scenario is JErc20Immutable {
    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    )
        public
        JErc20Immutable(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_
        )
    {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}

contract JEvil is JErc20Scenario {
    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    )
        public
        JErc20Scenario(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_
        )
    {}

    function evilSeize(
        JToken treasure,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) public returns (uint256) {
        return treasure.seize(liquidator, borrower, seizeTokens);
    }
}

contract JErc20DelegatorScenario is JErc20Delegator {
    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
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
        JErc20Delegator(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            implementation_,
            becomeImplementationData
        )
    {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract JCollateralCapErc20DelegatorScenario is JCollateralCapErc20Delegator {
    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
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
        JCollateralCapErc20Delegator(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            implementation_,
            becomeImplementationData
        )
    {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract JWrappedNativeDelegatorScenario is JWrappedNativeDelegator {
    constructor(
        address underlying_,
        JoetrollerInterface joetroller_,
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
        JWrappedNativeDelegator(
            underlying_,
            joetroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            implementation_,
            becomeImplementationData
        )
    {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function() external payable {}
}

contract JErc20DelegateHarness is JErc20Delegate {
    event Log(string x, address y);
    event Log(string x, uint256 y);

    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(
        address payable to,
        uint256 amount,
        bool isNative
    ) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount, isNative);
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint256 addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount, false);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount, false);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount, false);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, false);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, false);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract JErc20DelegateScenario is JErc20Delegate {
    constructor() public {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}

contract JErc20DelegateScenarioExtra is JErc20DelegateScenario {
    function iHaveSpoken() public pure returns (string memory) {
        return "i have spoken";
    }

    function itIsTheWay() public {
        admin = address(1); // make a change to test effect
    }

    function babyYoda() public pure {
        revert("protect the baby");
    }
}

contract JJLPDelegateHarness is JJLPDelegate {
    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount, false);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount, false);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount, false);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, false);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, false);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract JJLPDelegateScenario is JJLPDelegate {
    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}

contract JJTokenDelegateHarness is JJTokenDelegate {
    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount, false);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount, false);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount, false);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, false);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, false);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }

    function harnessSetInternalCash(uint256 amount) public returns (uint256) {
        internalCash = amount;
    }
}

contract JJTokenDelegateScenario is JJTokenDelegate {
    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}

contract JCollateralCapErc20DelegateHarness is JCollateralCapErc20Delegate {
    event Log(string x, address y);
    event Log(string x, uint256 y);

    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(
        address payable to,
        uint256 amount,
        bool isNative
    ) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount, isNative);
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetCollateralBalance(address account, uint256 amount) external {
        accountCollateralTokens[account] = amount;
    }

    function harnessSetCollateralBalanceInit(address account) external {
        isCollateralTokenInit[account] = true;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalCollateralTokens(uint256 totalCollateralTokens_) public {
        totalCollateralTokens = totalCollateralTokens_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint256 addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount, false);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount, false);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount, false);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, false);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, false);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }

    function harnessSetInternalCash(uint256 amount) public returns (uint256) {
        internalCash = amount;
    }
}

contract JCollateralCapErc20DelegateScenario is JCollateralCapErc20Delegate {
    constructor() public {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}

contract JWrappedNativeDelegateHarness is JWrappedNativeDelegate {
    event Log(string x, address y);
    event Log(string x, uint256 y);

    uint256 blockTimestamp = 100000;
    uint256 harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRateStored) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(
        address payable to,
        uint256 amount,
        bool isNative
    ) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount, isNative);
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint256) {
        return borrowRateMaxMantissa;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 blocks) public {
        blockTimestamp += blocks;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint256 addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 totalSupply_,
        uint256 totalBorrows_,
        uint256 totalReserves_
    ) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        // isNative is not important for mint fresh testing.
        (uint256 err, ) = mintFresh(account, mintAmount, true);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        // isNative is not important for redeem fresh testing.
        return redeemFresh(account, jTokenAmount, underlyingAmount, true);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        // isNative is not important for borrow fresh testing.
        return borrowFresh(account, borrowAmount, true);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayAmount
    ) public payable returns (uint256) {
        // isNative is not important for repay borrow fresh testing.
        (uint256 err, ) = repayBorrowFresh(payer, account, repayAmount, true);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        // isNative is not important for liquidate borrow fresh testing.
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral, true);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint256 amount) public returns (uint256) {
        return joetroller.borrowAllowed(address(this), msg.sender, amount);
    }

    function harnessDoTransferIn(address from, uint256 amount) public payable returns (uint256) {
        return doTransferIn(from, amount, true);
    }

    function harnessDoTransferOut(address payable to, uint256 amount) public payable {
        return doTransferOut(to, amount, true);
    }

    function() external payable {}
}

contract JWrappedNativeDelegateScenario is JWrappedNativeDelegate {
    constructor() public {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }

    function() external payable {}
}
