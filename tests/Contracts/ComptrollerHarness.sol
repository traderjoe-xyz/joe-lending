pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";
import "../../contracts/CToken.sol";
import "../../contracts/PriceOracle/PriceOracle.sol";

contract ComptrollerKovan is Comptroller {
    function getCompAddress() public view returns (address) {
        return 0x61460874a7196d6a22D1eE4922473664b3E95270;
    }
}

contract ComptrollerRopsten is Comptroller {
    function getCompAddress() public view returns (address) {
        return 0x1Fe16De955718CFAb7A44605458AB023838C2793;
    }
}

contract ComptrollerHarness is Comptroller {
    address compAddress;
    uint256 public blockNumber;

    constructor() public Comptroller() {}

    function setPauseGuardian(address harnessedPauseGuardian) public {
        pauseGuardian = harnessedPauseGuardian;
    }

    function setCompSupplyState(
        address cToken,
        uint224 index,
        uint32 blockNumber_
    ) public {
        compSupplyState[cToken].index = index;
        compSupplyState[cToken].block = blockNumber_;
    }

    function setCompBorrowState(
        address cToken,
        uint224 index,
        uint32 blockNumber_
    ) public {
        compBorrowState[cToken].index = index;
        compBorrowState[cToken].block = blockNumber_;
    }

    function setCompAccrued(address user, uint256 userAccrued) public {
        compAccrued[user] = userAccrued;
    }

    function setCompAddress(address compAddress_) public {
        compAddress = compAddress_;
    }

    function getCompAddress() public view returns (address) {
        return compAddress;
    }

    function setCompBorrowerIndex(
        address cToken,
        address borrower,
        uint256 index
    ) public {
        compBorrowerIndex[cToken][borrower] = index;
    }

    function setCompSupplierIndex(
        address cToken,
        address supplier,
        uint256 index
    ) public {
        compSupplierIndex[cToken][supplier] = index;
    }

    function harnessDistributeBorrowerComp(
        address cToken,
        address borrower,
        uint256 marketBorrowIndexMantissa
    ) public {
        distributeBorrowerComp(cToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessDistributeSupplierComp(address cToken, address supplier) public {
        distributeSupplierComp(cToken, supplier);
    }

    function harnessTransferComp(address user, uint256 userAccrued) public returns (uint256) {
        return transferComp(user, userAccrued);
    }

    function harnessFastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint256) {
        return blockNumber;
    }

    function getCompMarkets() public view returns (address[] memory) {
        uint256 m = allMarkets.length;
        uint256 n = 0;
        for (uint256 i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isComped) {
                n++;
            }
        }

        address[] memory compMarkets = new address[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isComped) {
                compMarkets[k++] = address(allMarkets[i]);
            }
        }
        return compMarkets;
    }
}

contract ComptrollerBorked {
    function _become(
        Unitroller unitroller,
        PriceOracle _oracle,
        uint256 _closeFactorMantissa,
        uint256 _maxAssets,
        bool _reinitializing
    ) public {
        _oracle;
        _closeFactorMantissa;
        _maxAssets;
        _reinitializing;

        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;

    bool failCalculateSeizeTokens;
    uint256 calculatedSeizeTokens;

    uint256 noError = 0;
    uint256 opaqueError = noError + 11; // an arbitrary, opaque error code

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata _cTokens) external returns (uint256[] memory) {
        _cTokens;
        uint256[] memory ret;
        return ret;
    }

    function exitMarket(address _cToken) external returns (uint256) {
        _cToken;
        return noError;
    }

    function checkMembership(address _account, CToken _cToken) external view returns (bool) {
        _account;
        _cToken;
        return true;
    }

    /*** Policy Hooks ***/

    function mintAllowed(
        address _cToken,
        address _minter,
        uint256 _mintAmount
    ) public returns (uint256) {
        _cToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(
        address _cToken,
        address _minter,
        uint256 _mintAmount,
        uint256 _mintTokens
    ) external {
        _cToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(
        address _cToken,
        address _redeemer,
        uint256 _redeemTokens
    ) public returns (uint256) {
        _cToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(
        address _cToken,
        address _redeemer,
        uint256 _redeemAmount,
        uint256 _redeemTokens
    ) external {
        _cToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(
        address _cToken,
        address _borrower,
        uint256 _borrowAmount
    ) public returns (uint256) {
        _cToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(
        address _cToken,
        address _borrower,
        uint256 _borrowAmount
    ) external {
        _cToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _cToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount
    ) public returns (uint256) {
        _cToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _cToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount,
        uint256 _borrowerIndex
    ) external {
        _cToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repayAmount
    ) public returns (uint256) {
        _cTokenBorrowed;
        _cTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repayAmount,
        uint256 _seizeTokens
    ) external {
        _cTokenBorrowed;
        _cTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _cTokenCollateral,
        address _cTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint256 _seizeTokens
    ) public returns (uint256) {
        _cTokenCollateral;
        _cTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _cTokenCollateral,
        address _cTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint256 _seizeTokens
    ) external {
        _cTokenCollateral;
        _cTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _cToken,
        address _src,
        address _dst,
        uint256 _transferTokens
    ) public returns (uint256) {
        _cToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _cToken,
        address _src,
        address _dst,
        uint256 _transferTokens
    ) external {
        _cToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        uint256 _repayAmount
    ) public view returns (uint256, uint256) {
        _cTokenBorrowed;
        _cTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    function updateCTokenVersion(address _cToken, ComptrollerV2Storage.Version _version) external {
        _cToken;
        _version;
    }

    /**** Mock Settors ****/

    /*** Policy Hooks ***/

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint256 seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns (string memory) {
        return s;
    }

    function addresses(address a) public pure returns (address) {
        return a;
    }

    function booly(bool b) public pure returns (bool) {
        return b;
    }

    function listOInts(uint256[] memory u) public pure returns (uint256[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
