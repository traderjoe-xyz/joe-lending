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
 * and pulls reward speeds from a RewardDistributor.
 * @dev Call these functions as dry-run transactions for the frontend.
 */
contract JoeLensV2 is Exponential {
    /// @notice Administrator for this contract
    address public admin;

    /// @notice The module that handles reward distribution
    address payable public rewardDistributor;

    /// @notice The native token symbol for this contract
    string public nativeSymbol;

    /// @notice Metadata for a market
    /// `jToken`: Market address
    /// `exchangeRateCurrent`: Exchange rate between jToken and the underlying asset including borrowing interest
    /// `supplyRatePerSecond`: The per-sec supply interest rate for this jToken
    /// `borrowRatePerSecond`: The per-sec borrow interest rate for this jToken
    /// `reserveFactorMantissa`: Multiplier representing the portion of accrued interest retained as reserves
    /// `totalBorrows`: Number of underlying tokens that have been borrowed from this market
    /// `totalReserves`: Number of underlying tokens retained as reserves
    /// `totalSupply`: Number of underlying tokens that have been supplied to this market
    /// `totalCash`: Number of underlying tokens supplied minus underlying tokens borrowed
    /// `totalCollateralTokens`: Number of tokens currently available as collateral
    /// `isListed`: Whether or not this market is listed
    /// `collateralFactorMantissa`: Multiplier representing amount you can borrow against your collateral between 0 and 1
    /// `underlyingAssetAddress`: Address of the underlying asset
    /// `jTokenDecimals`: EIP-20 decimal precision of the jToken
    /// `underlyingDecimals`: EIP-20 decimal precision of the underlying asset
    /// `version`: jToken version -> 0 = VANILLA, 1 = COLLATERAL, 2 = WRAPPED
    /// `collateralCap`: Maximum balance that can be considered as collateral
    /// `underlyingPrice`: The price of the underlying asset
    /// `supplyPaused`: Whether or not minting has been paused for this market
    /// `borrowPaused`: Whether or not borrowing has been paused for this market
    /// `supplyCap`: The maximum totalSupply that a market can have, minting will be disallowed after reaching this cap
    /// `borrowCap`: The maximum totalBorrow that a market can have, borrowing will be disallowed after reaching this cap
    /// `supplyJoeRewardsPerSecond`: The per-sec Joe supply reward rate for this jToken
    /// `borrowJoeRewardsPerSecond`: The per-sec Joe borrow reward rate for this jToken
    /// `supplyAvaxRewardsPerSecond`: The per-sec Avax supply reward rate for this jToken
    /// `borrowAvaxRewardsPerSecond`: The per-sec Avax borrow reward rate for this jToken
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

    /// @notice Balances for a market
    /// `jToken`: Market address
    /// `jTokenBalance`: Balance of underlying asset supplied by. Accrue interest is not called
    /// `supplyValueUSD`: Value of underlying asset supplied in USD
    /// `collateralValueUSD`: This is supplyValueUSD multiplied by collateral factor
    /// `borrowBalanceCurrent`: Borrow balance without accruing interest
    /// `borrowValueUSD`: Value of underlying asset borrowed in USD
    /// `underlyingTokenBalance`: Underlying balance currently held in accounts's wallet
    /// `underlyingTokenAllowance`: The number of underlying tokens allowed to be spent
    /// `collateralEnabled`: Whether or not this market is being used as collateral
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

    /// @notice An account's limits, including assets, liquidity, and shortfall
    /// `markets`: Markets that the account is entered into
    /// `liquidity`: Account's liquidity
    /// `shortfall`: Account's shortfall
    /// `totalCollateralValueUSD`: Total amount of a account's collateral in USD
    /// `totalBorrowValueUSD`: Total amount borrowed by a account in USD
    /// `healthFactor`: Ratio of totalCollateralValueUSD to totalBorrowValueUSD
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
     * @param _nativeSymbol The native symbol that will be defined for this contract
     * @param _rewardDistributor The reward distributor for this contract
     */
    constructor(string memory _nativeSymbol, address payable _rewardDistributor) public {
        admin = msg.sender;
        nativeSymbol = _nativeSymbol;
        rewardDistributor = _rewardDistributor;
    }

    /**
     * @notice Get metadata for all markets
     * @param jTokens All markets that metadata is being requested for
     * @return The metadata for all markets
     */
    function jTokenMetadataAll(JToken[] calldata jTokens) external returns (JTokenMetadata[] memory) {
        uint256 jTokenCount = jTokens.length;
        require(jTokenCount > 0, "invalid input");
        JTokenMetadata[] memory res = new JTokenMetadata[](jTokenCount);
        Joetroller joetroller = Joetroller(address(jTokens[0].joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        for (uint256 i = 0; i < jTokenCount; i++) {
            require(address(joetroller) == address(jTokens[i].joetroller()), "mismatch joetroller");
            res[i] = jTokenMetadataInternal(jTokens[i], joetroller, priceOracle);
        }
        return res;
    }

    /**
     * @notice Claims available rewards of a given reward type for an account
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param joetroller The joetroller address
     * @param joe The joe token address
     * @param account The account that will receive the rewards
     * @return The amount of tokens claimed
     */
    function getClaimableRewards(
        uint8 rewardType,
        address joetroller,
        address joe,
        address payable account
    ) external returns (uint256) {
        require(rewardType <= 1, "rewardType is invalid");
        if (rewardType == 0) {
            uint256 balanceBefore = EIP20Interface(joe).balanceOf(account);
            Joetroller(joetroller).claimReward(0, account);
            uint256 balanceAfter = EIP20Interface(joe).balanceOf(account);
            return sub_(balanceAfter, balanceBefore);
        } else if (rewardType == 1) {
            uint256 balanceBefore = account.balance;
            Joetroller(joetroller).claimReward(1, account);
            uint256 balanceAfter = account.balance;
            return sub_(balanceAfter, balanceBefore);
        }
    }

    /**
     * @notice Get metadata for a given market
     * @param jToken The market to get metadata for
     * @return The metadata for a market
     */
    function jTokenMetadata(JToken jToken) public returns (JTokenMetadata memory) {
        Joetroller joetroller = Joetroller(address(jToken.joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        return jTokenMetadataInternal(jToken, joetroller, priceOracle);
    }

    /**
     * @notice Get market balances for an account
     * @param jTokens All markets to retrieve account's balances for
     * @param account The account who's balances are being retrieved
     * @return An account's balances in requested markets
     */
    function jTokenBalancesAll(JToken[] memory jTokens, address account) public returns (JTokenBalances[] memory) {
        uint256 jTokenCount = jTokens.length;
        JTokenBalances[] memory res = new JTokenBalances[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            res[i] = jTokenBalances(jTokens[i], account);
        }
        return res;
    }

    /**
     * @notice Get an account's balances in a market
     * @param jToken The market to retrieve account's balances for
     * @param account The account who's balances are being retrieved
     * @return An account's balances in a market
     */
    function jTokenBalances(JToken jToken, address account) public returns (JTokenBalances memory) {
        JTokenBalances memory vars;
        Joetroller joetroller = Joetroller(address(jToken.joetroller()));

        vars.jToken = address(jToken);
        vars.collateralEnabled = joetroller.checkMembership(account, jToken);

        if (compareStrings(jToken.symbol(), nativeSymbol)) {
            vars.underlyingTokenBalance = account.balance;
            vars.underlyingTokenAllowance = account.balance;
        } else {
            JErc20 jErc20 = JErc20(address(jToken));
            EIP20Interface underlying = EIP20Interface(jErc20.underlying());
            vars.underlyingTokenBalance = underlying.balanceOf(account);
            vars.underlyingTokenAllowance = underlying.allowance(account, address(jToken));
        }

        vars.jTokenBalance = jToken.balanceOf(account);
        vars.borrowBalanceCurrent = jToken.borrowBalanceCurrent(account);

        vars.balanceOfUnderlyingCurrent = jToken.balanceOfUnderlying(account);
        PriceOracle priceOracle = joetroller.oracle();
        uint256 underlyingPrice = priceOracle.getUnderlyingPrice(jToken);

        (, uint256 collateralFactorMantissa, ) = joetroller.markets(address(jToken));

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
     * @param joetroller The joetroller address
     * @param account The account who's limits are being retrieved
     * @return An account's limits
     */
    function getAccountLimits(Joetroller joetroller, address account) public returns (AccountLimits memory) {
        AccountLimits memory vars;
        uint256 errorCode;

        (errorCode, vars.liquidity, vars.shortfall) = joetroller.getAccountLiquidity(account);
        require(errorCode == 0, "Can't get account liquidity");

        vars.markets = joetroller.getAssetsIn(account);
        JTokenBalances[] memory jTokenBalancesList = jTokenBalancesAll(vars.markets, account);
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
     * @param newRewardDistributor The address of the new reward distributor
     */
    function _setRewardDistributor(address payable newRewardDistributor) public {
        require(msg.sender == admin, "not admin");

        rewardDistributor = newRewardDistributor;
    }

    /**
     * @notice Internal function that fetches the metadata for a market
     * @param jToken The market to get metadata for
     * @param joetroller The joetroller address
     * @param priceOracle Address of price oracle used to get underlying price
     * @return The metadata for a given market
     */
    function jTokenMetadataInternal(
        JToken jToken,
        Joetroller joetroller,
        PriceOracle priceOracle
    ) internal returns (JTokenMetadata memory) {
        (bool isListed, uint256 collateralFactorMantissa, JoetrollerV1Storage.Version version) = joetroller.markets(
            address(jToken)
        );
        address underlyingAssetAddress;
        uint256 underlyingDecimals;
        uint256 collateralCap;
        uint256 totalCollateralTokens;

        if (compareStrings(jToken.symbol(), nativeSymbol)) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            JErc20 jErc20 = JErc20(address(jToken));
            underlyingAssetAddress = jErc20.underlying();
            underlyingDecimals = EIP20Interface(jErc20.underlying()).decimals();
        }

        if (version == JoetrollerV1Storage.Version.COLLATERALCAP) {
            collateralCap = JCollateralCapErc20Interface(address(jToken)).collateralCap();
            totalCollateralTokens = JCollateralCapErc20Interface(address(jToken)).totalCollateralTokens();
        }

        return
            JTokenMetadata({
                jToken: address(jToken),
                exchangeRateCurrent: jToken.exchangeRateCurrent(),
                supplyRatePerSecond: jToken.supplyRatePerSecond(),
                borrowRatePerSecond: jToken.borrowRatePerSecond(),
                reserveFactorMantissa: jToken.reserveFactorMantissa(),
                totalBorrows: jToken.totalBorrows(),
                totalReserves: jToken.totalReserves(),
                totalSupply: jToken.totalSupply(),
                totalCash: jToken.getCash(),
                totalCollateralTokens: totalCollateralTokens,
                isListed: isListed,
                collateralFactorMantissa: collateralFactorMantissa,
                underlyingAssetAddress: underlyingAssetAddress,
                jTokenDecimals: jToken.decimals(),
                underlyingDecimals: underlyingDecimals,
                version: version,
                collateralCap: collateralCap,
                underlyingPrice: priceOracle.getUnderlyingPrice(jToken),
                supplyPaused: joetroller.mintGuardianPaused(address(jToken)),
                borrowPaused: joetroller.borrowGuardianPaused(address(jToken)),
                supplyCap: joetroller.supplyCaps(address(jToken)),
                borrowCap: joetroller.borrowCaps(address(jToken)),
                supplyJoeRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardSupplySpeeds(0, address(jToken)),
                borrowJoeRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardBorrowSpeeds(0, address(jToken)),
                supplyAvaxRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardSupplySpeeds(1, address(jToken)),
                borrowAvaxRewardsPerSecond: IRewardDistributor(rewardDistributor).rewardBorrowSpeeds(1, address(jToken))
            });
    }

    /**
     * @notice Helper function to compare two strings
     * @param a The first string in the comparison
     * @param b The second string in the comparison
     * @return Whether two strings are equal or not
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
