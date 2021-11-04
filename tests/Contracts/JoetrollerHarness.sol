pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/Joetroller.sol";
import "../../contracts/JoetrollerStorage.sol";
import "../../contracts/JToken.sol";
import "../../contracts/PriceOracle/PriceOracle.sol";

contract JoetrollerKovan is Joetroller {
    function getJoeAddress() public view returns (address) {
        return 0x61460874a7196d6a22D1eE4922473664b3E95270;
    }
}

contract JoetrollerRopsten is Joetroller {
    function getJoeAddress() public view returns (address) {
        return 0x1Fe16De955718CFAb7A44605458AB023838C2793;
    }
}

contract JoetrollerHarness is Joetroller {
    uint256 public blockTimestamp;

    constructor() public Joetroller() {}

    function setPauseGuardian(address harnessedPauseGuardian) public {
        pauseGuardian = harnessedPauseGuardian;
    }

    function harnessFastForward(uint256 secs) public returns (uint256) {
        blockTimestamp += secs;
        return blockTimestamp;
    }

    function setBlockTimestamp(uint256 number) public {
        blockTimestamp = number;
    }

    function getBlockTimestamp() public view returns (uint256) {
        return blockTimestamp;
    }
}

// BankerJoeJoetrollerHarness is only used for CJTokenHarness
contract BankerJoeJoetrollerHarness is JoetrollerHarness {
    address joeAddress;

    constructor() public JoetrollerHarness() {}

    function setJoeAddress(address joeAddress_) public {
        joeAddress = joeAddress_;
    }

    function getJoeAddress() public view returns (address) {
        return joeAddress;
    }

    function claimJoe(
        address[] memory holders,
        JToken[] memory jTokens,
        bool borrowers,
        bool suppliers
    ) public {
        // unused
        holders;
        jTokens;
        borrowers;
        suppliers;
    }
}

contract JoetrollerBorked {
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

contract BoolJoetroller is JoetrollerInterface, Joetroller {
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

    function enterMarkets(address[] memory _jTokens) public returns (uint256[] memory) {
        _jTokens;
        uint256[] memory ret;
        return ret;
    }

    function exitMarket(address _jToken) external returns (uint256) {
        _jToken;
        return noError;
    }

    function checkMembership(address _account, JToken _jToken) external view returns (bool) {
        _account;
        _jToken;
        return true;
    }

    /*** Policy Hooks ***/

    function mintAllowed(
        address _jToken,
        address _minter,
        uint256 _mintAmount
    ) public returns (uint256) {
        _jToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(
        address _jToken,
        address _minter,
        uint256 _mintAmount,
        uint256 _mintTokens
    ) external {
        _jToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(
        address _jToken,
        address _redeemer,
        uint256 _redeemTokens
    ) public returns (uint256) {
        _jToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(
        address _jToken,
        address _redeemer,
        uint256 _redeemAmount,
        uint256 _redeemTokens
    ) external {
        _jToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(
        address _jToken,
        address _borrower,
        uint256 _borrowAmount
    ) public returns (uint256) {
        _jToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(
        address _jToken,
        address _borrower,
        uint256 _borrowAmount
    ) external {
        _jToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _jToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount
    ) public returns (uint256) {
        _jToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _jToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount,
        uint256 _borrowerIndex
    ) external {
        _jToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _jTokenBorrowed,
        address _jTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repayAmount
    ) public returns (uint256) {
        _jTokenBorrowed;
        _jTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _jTokenBorrowed,
        address _jTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repayAmount,
        uint256 _seizeTokens
    ) external {
        _jTokenBorrowed;
        _jTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _jTokenCollateral,
        address _jTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint256 _seizeTokens
    ) public returns (uint256) {
        _jTokenCollateral;
        _jTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _jTokenCollateral,
        address _jTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint256 _seizeTokens
    ) external {
        _jTokenCollateral;
        _jTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _jToken,
        address _src,
        address _dst,
        uint256 _transferTokens
    ) public returns (uint256) {
        _jToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _jToken,
        address _src,
        address _dst,
        uint256 _transferTokens
    ) external {
        _jToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _jTokenBorrowed,
        address _jTokenCollateral,
        uint256 _repayAmount
    ) public view returns (uint256, uint256) {
        _jTokenBorrowed;
        _jTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    function updateJTokenVersion(address _jToken, JoetrollerV1Storage.Version _version) external {
        _jToken;
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

contract EchoTypesJoetroller is UnitrollerAdminStorage {
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
