// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../JErc20.sol";
import "../Joetroller.sol";
import "../JToken.sol";
import "../PriceOracle/PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Exponential.sol";
import "./IRewardLens.sol";

interface JJLPInterface {
    function claimJoe(address) external returns (uint256);
}

interface JJTokenInterface {
    function claimJoe(address) external returns (uint256);
}

/**
 * @notice This is a version of JoeLens that contains write transactions.
 * @dev Call these functions as dry-run transactions for the frontend.
 */
contract JoeLens is Exponential {
    string public nativeSymbol;
    address private rewardLensAddress;

    constructor(string memory _nativeSymbol, address _rewardLensAddress) public {
        nativeSymbol = _nativeSymbol;
        rewardLensAddress = _rewardLensAddress;
    }

    /*** Market info functions ***/
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

    function jTokenMetadata(JToken jToken) public returns (JTokenMetadata memory) {
        Joetroller joetroller = Joetroller(address(jToken.joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        return jTokenMetadataInternal(jToken, joetroller, priceOracle);
    }

    function jTokenMetadataInternal(
        JToken jToken,
        Joetroller joetroller,
        PriceOracle priceOracle
    ) internal returns (JTokenMetadata memory) {
        uint256 exchangeRateCurrent = jToken.exchangeRateCurrent();
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

        IRewardLens.MarketRewards memory jTokenRewards = IRewardLens(rewardLensAddress).allMarketRewards(address(jToken));
    
        return
            JTokenMetadata({
                jToken: address(jToken),
                exchangeRateCurrent: exchangeRateCurrent,
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
                supplyJoeRewardsPerSecond: jTokenRewards.supplyRewardsJoePerSec,
                borrowJoeRewardsPerSecond: jTokenRewards.borrowRewardsJoePerSec,
                supplyAvaxRewardsPerSecond: jTokenRewards.supplyRewardsAvaxPerSec,
                borrowAvaxRewardsPerSecond: jTokenRewards.borrowRewardsAvaxPerSec
            });
    }

    /*** Account JToken info functions ***/

    struct JTokenBalances {
        address jToken;
        uint256 jTokenBalance; // Same as collateral balance - the number of jTokens held
        uint256 balanceOfUnderlyingCurrent; // Balance of underlying asset supplied by. Accrue interest is not called.
        uint256 supplyValueUSD;
        uint256 collateralValueUSD; // This is supplyValueUSD multiplied by collateral factor
        uint256 borrowBalanceCurrent; // Borrow balance without accruing interest
        uint256 borrowValueUSD;
        uint256 underlyingTokenBalance; // Underlying balance current held in user's wallet
        uint256 underlyingTokenAllowance;
        bool collateralEnabled;
    }

    function jTokenBalancesAll(JToken[] memory jTokens, address account) public returns (JTokenBalances[] memory) {
        uint256 jTokenCount = jTokens.length;
        JTokenBalances[] memory res = new JTokenBalances[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            res[i] = jTokenBalances(jTokens[i], account);
        }
        return res;
    }

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

    struct AccountLimits {
        JToken[] markets;
        uint256 liquidity;
        uint256 shortfall;
        uint256 totalCollateralValueUSD;
        uint256 totalBorrowValueUSD;
        uint256 healthFactor;
    }

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

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
