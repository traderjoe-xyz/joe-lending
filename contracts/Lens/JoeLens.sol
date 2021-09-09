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

contract JoeLens is Exponential {
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

        if (compareStrings(jToken.symbol(), "jAVAX")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            JErc20 cErc20 = JErc20(address(jToken));
            underlyingAssetAddress = cErc20.underlying();
            underlyingDecimals = EIP20Interface(cErc20.underlying()).decimals();
        }

        if (version == JoetrollerV1Storage.Version.COLLATERALCAP) {
            collateralCap = JCollateralCapErc20Interface(address(jToken)).collateralCap();
            totalCollateralTokens = JCollateralCapErc20Interface(address(jToken)).totalCollateralTokens();
        }

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
                borrowCap: joetroller.borrowCaps(address(jToken))
            });
    }

    function jTokenMetadata(JToken jToken) public returns (JTokenMetadata memory) {
        Joetroller joetroller = Joetroller(address(jToken.joetroller()));
        PriceOracle priceOracle = joetroller.oracle();
        return jTokenMetadataInternal(jToken, joetroller, priceOracle);
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

    struct JTokenBalances {
        address jToken;
        uint256 balanceOf;
        uint256 borrowBalanceCurrent;
        uint256 balanceOfUnderlying;
        uint256 tokenBalance;
        uint256 tokenAllowance;
        bool collateralEnabled;
        uint256 collateralBalance;
        uint256 nativeTokenBalance;
    }

    function jTokenBalances(JToken jToken, address payable account) public returns (JTokenBalances memory) {
        bool collateralEnabled = Joetroller(address(jToken.joetroller())).checkMembership(account, jToken);
        uint256 tokenBalance;
        uint256 tokenAllowance;
        uint256 collateralBalance;

        if (compareStrings(jToken.symbol(), "JAVAX")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            JErc20 cErc20 = JErc20(address(jToken));
            EIP20Interface underlying = EIP20Interface(cErc20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(jToken));
        }

        if (collateralEnabled) {
            (, collateralBalance, , ) = jToken.getAccountSnapshot(account);
        }

        return
            JTokenBalances({
                jToken: address(jToken),
                balanceOf: jToken.balanceOf(account),
                borrowBalanceCurrent: jToken.borrowBalanceCurrent(account),
                balanceOfUnderlying: jToken.balanceOfUnderlying(account),
                tokenBalance: tokenBalance,
                tokenAllowance: tokenAllowance,
                collateralEnabled: collateralEnabled,
                collateralBalance: collateralBalance,
                nativeTokenBalance: account.balance
            });
    }

    function jTokenBalancesAll(JToken[] calldata jTokens, address payable account)
        external
        returns (JTokenBalances[] memory)
    {
        uint256 jTokenCount = jTokens.length;
        JTokenBalances[] memory res = new JTokenBalances[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            res[i] = jTokenBalances(jTokens[i], account);
        }
        return res;
    }

    struct AccountLimits {
        JToken[] markets;
        uint256 liquidity;
        uint256 shortfall;
    }

    function getAccountLimits(Joetroller joetroller, address account) public returns (AccountLimits memory) {
        (uint256 errorCode, uint256 liquidity, uint256 shortfall) = joetroller.getAccountLiquidity(account);
        require(errorCode == 0);

        return AccountLimits({markets: joetroller.getAssetsIn(account), liquidity: liquidity, shortfall: shortfall});
    }

    function getClaimableJoeRewards(
        JJTokenInterface[] calldata jTokens,
        address joe,
        address account
    ) external returns (uint256[] memory) {
        uint256 jTokenCount = jTokens.length;
        uint256[] memory rewards = new uint256[](jTokenCount);
        for (uint256 i = 0; i < jTokenCount; i++) {
            uint256 balanceBefore = EIP20Interface(joe).balanceOf(account);
            jTokens[i].claimJoe(account);
            uint256 balanceAfter = EIP20Interface(joe).balanceOf(account);
            rewards[i] = sub_(balanceAfter, balanceBefore);
        }
        return rewards;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
