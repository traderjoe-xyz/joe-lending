// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../JErc20.sol";
import "../Joetroller.sol";
import "../JToken.sol";
import "../PriceOracle/PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Exponential.sol";

interface JJLPInterface {
    function claimJoe(address) external returns (uint256);
}

interface JJTokenInterface {
    function claimJoe(address) external returns (uint256);
}

/**
 * @notice This is a version of JoeLens that only contains view functions.
 */
contract JoeLensView is Exponential {

    string public nativeSymbol;

    constructor(string memory _nativeSymbol) public {
      nativeSymbol = _nativeSymbol;
    }

    /*** Market info functions ***/
  
    struct JTokenMetadata {
        address jToken;
        uint256 exchangeRateStored;
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
    }

    function jTokenMetadata(JToken jToken) public view returns (JTokenMetadata memory) {
        Joetroller joetroller = Joetroller(address(jToken.joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        return jTokenMetadataInternal(jToken, joetroller, priceOracle);
    }

    function jTokenMetadataInternal(
        JToken jToken,
        Joetroller joetroller,
        PriceOracle priceOracle
    ) internal view returns (JTokenMetadata memory) {
        uint256 exchangeRateStored = jToken.exchangeRateStored();
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
                exchangeRateStored: exchangeRateStored,
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
                borrowCap: joetroller.borrowCaps(address(jToken))
            });
    }

    /*** Account JToken info functions ***/

    struct JTokenBalances {
        address jToken;
        uint256 supplyBalance; // Same as collateral balance - the number of jTokens held
        uint256 supplyValueUSD;
        uint256 collateralValueUSD; // This is supplyValueUSD multiplied by collateral factor
        uint256 borrowBalanceStored; // Borrow balance without accruing interest
        uint256 borrowValueUSD;
        uint256 balanceOfUnderlyingStored; // Balance of underlying asset supplied by. Accrue interest is not called.
        uint256 underlyingTokenBalance; // Underlying balance current held in user's wallet
        uint256 underlyingTokenAllowance;
        bool collateralEnabled;
    }

    function jTokenBalancesAll(JToken[] calldata jTokens, address payable account)
        external view
        returns (JTokenBalances[] memory)
    {
        uint256 jTokenCount = jTokens.length;
        JTokenBalances[] memory res = new JTokenBalances[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            res[i] = jTokenBalances(jTokens[i], account);
        }
        return res;
    }

    function jTokenBalances(JToken jToken, address payable account) public view returns (JTokenBalances memory) {
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

        uint256 exchangeRateStored;
        (, vars.supplyBalance, vars.borrowBalanceStored, exchangeRateStored) =
          jToken.getAccountSnapshot(account);

        Exp memory exchangeRate = Exp({mantissa: exchangeRateStored});
        vars.balanceOfUnderlyingStored = mul_ScalarTruncate(exchangeRate, vars.supplyBalance);
        PriceOracle priceOracle = joetroller.oracle();
        uint256 underlyingPrice = priceOracle.getUnderlyingPrice(jToken);

        (, uint256 collateralFactorMantissa, ) = joetroller.markets(address(jToken));

        Exp memory supplyValueInUnderlying = Exp({ mantissa: vars.balanceOfUnderlyingStored });
        vars.supplyValueUSD = mul_ScalarTruncate(supplyValueInUnderlying, underlyingPrice);

        Exp memory collateralFactor = Exp({ mantissa: collateralFactorMantissa });
        vars.collateralValueUSD = mul_ScalarTruncate(collateralFactor, vars.supplyValueUSD);

        Exp memory borrowBalance = Exp({ mantissa: vars.borrowBalanceStored });
        vars.borrowValueUSD = mul_ScalarTruncate(borrowBalance, underlyingPrice);

        return vars;
    }

    struct AccountLimits {
        JToken[] markets;
        uint256 liquidity;
        uint256 shortfall;
    }

    function getAccountLimits(Joetroller joetroller, address account) public view returns (AccountLimits memory) {
        (uint256 errorCode, uint256 liquidity, uint256 shortfall) = joetroller.getAccountLiquidity(account);
        require(errorCode == 0);

        return AccountLimits({markets: joetroller.getAssetsIn(account), liquidity: liquidity, shortfall: shortfall});
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
