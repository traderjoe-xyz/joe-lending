// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../JErc20.sol";
import "../Joetroller.sol";
import "../JToken.sol";
import "../PriceOracle/PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Exponential.sol";
import "../IRewardDistributor.sol";

/**
 * @notice This is a version of JoeLens that contains write transactions
 * and pulls reward speeds from a RewardDistributor. JoeLensV2 mainly makes calls
 * to various contracts to retrieve market/account data from our lending platform
 * and wraps it up nicely to be sent to the frontend.
 * @dev Call these functions as dry-run transactions for the frontend.
 */
contract JoeLensV2 is Exponential {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     *@notice The module that handles reward distribution
     */
    address payable public rewardDistributor;

    /**
     * @notice Represents the symbol of the market for the native gas token, such as jAVAX
     */
    string public nativeSymbolMarket;

    struct JTokenMetadata {
        address jToken;
        uint256 exchangeRateCurrent;
        uint256 supplyRatePerSecond;
        uint256 borrowRatePerSecond;
        uint256 reserveFactorMantissa;
        uint256 totalBorrows;
        uint256 totalReserves;
        uint256 totalSupply;
        uint256 totalCash;
        uint256 totalCollateralTokens;
        bool isListed;
        uint256 collateralFactorMantissa;
        address underlyingAssetAddress;
        uint256 jTokenDecimals;
        uint256 underlyingDecimals;
        JoetrollerV1Storage.Version version;
        uint256 collateralCap;
        uint256 underlyingPrice;
        bool supplyPaused;
        bool borrowPaused;
        uint256 supplyCap;
        uint256 borrowCap;
        uint256 supplyJoeRewardsPerSecond;
        uint256 borrowJoeRewardsPerSecond;
        uint256 supplyAvaxRewardsPerSecond;
        uint256 borrowAvaxRewardsPerSecond;
    }

    struct JTokenBalances {
        address jToken;
        uint256 jTokenBalance;
        uint256 balanceOfUnderlyingCurrent;
        uint256 supplyValueUSD;
        uint256 collateralValueUSD;
        uint256 borrowBalanceCurrent;
        uint256 borrowValueUSD;
        uint256 underlyingTokenBalance;
        uint256 underlyingTokenAllowance;
        bool collateralEnabled;
    }

    struct AccountLimits {
        JToken[] markets;
        uint256 liquidity;
        uint256 shortfall;
        uint256 totalCollateralValueUSD;
        uint256 totalBorrowValueUSD;
        uint256 healthFactor;
    }

    /**
     * @notice Constructor function that initializes the native symbol and administrator for this contract
     * @param _nativeSymbolMarket Represents the symbol of the market for the native gas token, such as jAVAX
     * @param _rewardDistributor The reward distributor for this contract
     */
    constructor(string memory _nativeSymbolMarket, address payable _rewardDistributor) public {
        admin = msg.sender;
        nativeSymbolMarket = _nativeSymbolMarket;
        rewardDistributor = _rewardDistributor;
    }

    /**
     * @notice Get metadata for all markets
     * @param _jTokens All markets that metadata is being requested for
     * @return The metadata for all markets
     */
    function jTokenMetadataAll(JToken[] calldata _jTokens) external returns (JTokenMetadata[] memory) {
        uint256 jTokenCount = _jTokens.length;
        require(jTokenCount > 0, "invalid input");
        JTokenMetadata[] memory res = new JTokenMetadata[](jTokenCount);
        Joetroller joetroller = Joetroller(address(_jTokens[0].joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        for (uint256 i = 0; i < jTokenCount; i++) {
            require(address(joetroller) == address(_jTokens[i].joetroller()), "mismatch joetroller");
            res[i] = _jTokenMetadataInternal(_jTokens[i], joetroller, priceOracle);
        }
        return res;
    }

    /**
     * @notice Claims available rewards of a given reward type for an account
     * @param _rewardType 0 = JOE, 1 = AVAX
     * @param _joetroller The joetroller address
     * @param _joe The joe token address
     * @param _account The account that will receive the rewards
     * @return The amount of tokens claimed
     */
    function getClaimableRewards(
        uint8 _rewardType,
        address _joetroller,
        address _joe,
        address payable _account
    ) external returns (uint256) {
        require(_rewardType <= 1, "rewardType is invalid");
        if (_rewardType == 0) {
            uint256 balanceBefore = EIP20Interface(_joe).balanceOf(_account);
            Joetroller(_joetroller).claimReward(0, _account);
            uint256 balanceAfter = EIP20Interface(_joe).balanceOf(_account);
            return sub_(balanceAfter, balanceBefore);
        } else if (_rewardType == 1) {
            uint256 balanceBefore = _account.balance;
            Joetroller(_joetroller).claimReward(1, _account);
            uint256 balanceAfter = _account.balance;
            return sub_(balanceAfter, balanceBefore);
        }
    }

    /**
     * @notice Get metadata for a given market
     * @param _jToken The market to get metadata for
     * @return The metadata for a market
     */
    function jTokenMetadata(JToken _jToken) external returns (JTokenMetadata memory) {
        Joetroller joetroller = Joetroller(address(_jToken.joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        return _jTokenMetadataInternal(_jToken, joetroller, priceOracle);
    }

    /**
     * @notice Get market balances for an account
     * @param _jTokens All markets to retrieve account's balances for
     * @param _account The account who's balances are being retrieved
     * @return An account's balances in requested markets
     */
    function jTokenBalancesAll(JToken[] memory _jTokens, address _account) public returns (JTokenBalances[] memory) {
        uint256 jTokenCount = _jTokens.length;
        JTokenBalances[] memory res = new JTokenBalances[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            res[i] = jTokenBalances(_jTokens[i], _account);
        }
        return res;
    }

    /**
     * @notice Get an account's balances in a market
     * @param _jToken The market to retrieve account's balances for
     * @param _account The account who's balances are being retrieved
     * @return An account's balances in a market
     */
    function jTokenBalances(JToken _jToken, address _account) public returns (JTokenBalances memory) {
        JTokenBalances memory vars;
        Joetroller joetroller = Joetroller(address(_jToken.joetroller()));

        vars.jToken = address(_jToken);
        vars.collateralEnabled = joetroller.checkMembership(_account, _jToken);

        if (_compareStrings(_jToken.symbol(), nativeSymbolMarket)) {
            vars.underlyingTokenBalance = _account.balance;
            vars.underlyingTokenAllowance = _account.balance;
        } else {
            JErc20 jErc20 = JErc20(address(_jToken));
            EIP20Interface underlying = EIP20Interface(jErc20.underlying());
            vars.underlyingTokenBalance = underlying.balanceOf(_account);
            vars.underlyingTokenAllowance = underlying.allowance(_account, address(_jToken));
        }

        vars.jTokenBalance = _jToken.balanceOf(_account);
        vars.borrowBalanceCurrent = _jToken.borrowBalanceCurrent(_account);

        vars.balanceOfUnderlyingCurrent = _jToken.balanceOfUnderlying(_account);
        PriceOracle priceOracle = joetroller.oracle();
        uint256 underlyingPrice = priceOracle.getUnderlyingPrice(_jToken);

        (, uint256 collateralFactorMantissa, ) = joetroller.markets(address(_jToken));

        Exp memory supplyValueInUnderlying = Exp({mantissa: vars.balanceOfUnderlyingCurrent});
        vars.supplyValueUSD = mul_ScalarTruncate(supplyValueInUnderlying, underlyingPrice);

        Exp memory collateralFactor = Exp({mantissa: collateralFactorMantissa});
        vars.collateralValueUSD = mul_ScalarTruncate(collateralFactor, vars.supplyValueUSD);

        Exp memory borrowBalance = Exp({mantissa: vars.borrowBalanceCurrent});
        vars.borrowValueUSD = mul_ScalarTruncate(borrowBalance, underlyingPrice);

        return vars;
    }

    /**
     * @notice Get an account's limits
     * @param _joetroller The joetroller address
     * @param _account The account who's limits are being retrieved
     * @return An account's limits
     */
    function getAccountLimits(Joetroller _joetroller, address _account) external returns (AccountLimits memory) {
        AccountLimits memory vars;
        uint256 errorCode;

        (errorCode, vars.liquidity, vars.shortfall) = _joetroller.getAccountLiquidity(_account);
        require(errorCode == 0, "Can't get account liquidity");

        vars.markets = _joetroller.getAssetsIn(_account);
        JTokenBalances[] memory jTokenBalancesList = jTokenBalancesAll(vars.markets, _account);
        for (uint256 i = 0; i < jTokenBalancesList.length; i++) {
            vars.totalCollateralValueUSD = add_(vars.totalCollateralValueUSD, jTokenBalancesList[i].collateralValueUSD);
            vars.totalBorrowValueUSD = add_(vars.totalBorrowValueUSD, jTokenBalancesList[i].borrowValueUSD);
        }

        Exp memory totalBorrows = Exp({mantissa: vars.totalBorrowValueUSD});

        vars.healthFactor = vars.totalCollateralValueUSD == 0 ? 0 : vars.totalBorrowValueUSD > 0
            ? div_(vars.totalCollateralValueUSD, totalBorrows)
            : 100;

        return vars;
    }

    /**
     * @notice Admin function to set new reward distributor address
     * @param _newRewardDistributor The address of the new reward distributor
     */
    function setRewardDistributor(address payable _newRewardDistributor) external {
        require(msg.sender == admin, "not admin");

        rewardDistributor = _newRewardDistributor;
    }

    /**
     * @notice Admin function to set new admin address
     * @param _admin The address of the new admin
     */
    function setAdmin(address payable _admin) external {
        require(msg.sender == admin, "not admin");

        admin = _admin;
    }

    /**
     * @notice Internal function that fetches the metadata for a market
     * @param _jToken The market to get metadata for
     * @param _joetroller The joetroller address
     * @param _priceOracle Address of price oracle used to get underlying price
     * @return The metadata for a given market
     */
    function _jTokenMetadataInternal(
        JToken _jToken,
        Joetroller _joetroller,
        PriceOracle _priceOracle
    ) private returns (JTokenMetadata memory) {
        (bool isListed, uint256 collateralFactorMantissa, JoetrollerV1Storage.Version version) = _joetroller.markets(
            address(_jToken)
        );
        address underlyingAssetAddress;
        uint256 underlyingDecimals;
        uint256 collateralCap;
        uint256 totalCollateralTokens;

        if (_compareStrings(_jToken.symbol(), nativeSymbolMarket)) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            JErc20 jErc20 = JErc20(address(_jToken));
            underlyingAssetAddress = jErc20.underlying();
            underlyingDecimals = EIP20Interface(jErc20.underlying()).decimals();
        }

        if (version == JoetrollerV1Storage.Version.COLLATERALCAP) {
            collateralCap = JCollateralCapErc20Interface(address(_jToken)).collateralCap();
            totalCollateralTokens = JCollateralCapErc20Interface(address(_jToken)).totalCollateralTokens();
        }

        return
            JTokenMetadata({
                jToken: address(_jToken),
                exchangeRateCurrent: _jToken.exchangeRateCurrent(),
                supplyRatePerSecond: _jToken.supplyRatePerSecond(),
                borrowRatePerSecond: _jToken.borrowRatePerSecond(),
                reserveFactorMantissa: _jToken.reserveFactorMantissa(),
                totalBorrows: _jToken.totalBorrows(),
                totalReserves: _jToken.totalReserves(),
                totalSupply: _jToken.totalSupply(),
                totalCash: _jToken.getCash(),
                totalCollateralTokens: totalCollateralTokens,
                isListed: isListed,
                collateralFactorMantissa: collateralFactorMantissa,
                underlyingAssetAddress: underlyingAssetAddress,
                jTokenDecimals: _jToken.decimals(),
                underlyingDecimals: underlyingDecimals,
                version: version,
                collateralCap: collateralCap,
                underlyingPrice: _priceOracle.getUnderlyingPrice(_jToken),
                supplyPaused: _joetroller.mintGuardianPaused(address(_jToken)),
                borrowPaused: _joetroller.borrowGuardianPaused(address(_jToken)),
                supplyCap: _joetroller.supplyCaps(address(_jToken)),
                borrowCap: _joetroller.borrowCaps(address(_jToken)),
                supplyJoeRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardSupplySpeeds(0, address(_jToken)),
                borrowJoeRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardBorrowSpeeds(0, address(_jToken)),
                supplyAvaxRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardSupplySpeeds(1, address(_jToken)),
                borrowAvaxRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardBorrowSpeeds(1, address(_jToken))
            });
    }

    /**
     * @notice Helper function to compare two strings
     * @param _a The first string in the comparison
     * @param _b The second string in the comparison
     * @return Whether two strings are equal or not
     */
    function _compareStrings(string memory _a, string memory _b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((_a))) == keccak256(abi.encodePacked((_b))));
    }
}
