pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../CErc20.sol";
import "../Comptroller.sol";
import "../CToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Exponential.sol";

interface CSLPInterface {
    function claimSushi(address) external returns (uint);
}

interface CCTokenInterface {
    function claimComp(address) external returns (uint);
}

contract CompoundLens is Exponential {
    struct CTokenMetadata {
        address cToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        uint totalCollateralTokens;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint cTokenDecimals;
        uint underlyingDecimals;
        ComptrollerV1Storage.Version version;
        uint collateralCap;
        uint underlyingPrice;
        bool supplyPaused;
        bool borrowPaused;
        uint supplyCap;
        uint borrowCap;
    }

    function cTokenMetadataInternal(CToken cToken, Comptroller comptroller, PriceOracle priceOracle) internal returns (CTokenMetadata memory) {
        uint exchangeRateCurrent = cToken.exchangeRateCurrent();
        (bool isListed, uint collateralFactorMantissa, ComptrollerV1Storage.Version version) = comptroller.markets(address(cToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;
        uint collateralCap;
        uint totalCollateralTokens;

        if (compareStrings(cToken.symbol(), "crFTM")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            CErc20 cErc20 = CErc20(address(cToken));
            underlyingAssetAddress = cErc20.underlying();
            underlyingDecimals = EIP20Interface(cErc20.underlying()).decimals();
        }

        if (version == ComptrollerV1Storage.Version.COLLATERALCAP) {
            collateralCap = CCollateralCapErc20Interface(address(cToken)).collateralCap();
            totalCollateralTokens = CCollateralCapErc20Interface(address(cToken)).totalCollateralTokens();
        }

        return CTokenMetadata({
            cToken: address(cToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: cToken.supplyRatePerBlock(),
            borrowRatePerBlock: cToken.borrowRatePerBlock(),
            reserveFactorMantissa: cToken.reserveFactorMantissa(),
            totalBorrows: cToken.totalBorrows(),
            totalReserves: cToken.totalReserves(),
            totalSupply: cToken.totalSupply(),
            totalCash: cToken.getCash(),
            totalCollateralTokens: totalCollateralTokens,
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            cTokenDecimals: cToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            version: version,
            collateralCap: collateralCap,
            underlyingPrice: priceOracle.getUnderlyingPrice(cToken),
            supplyPaused: comptroller.mintGuardianPaused(address(cToken)),
            borrowPaused: comptroller.borrowGuardianPaused(address(cToken)),
            supplyCap: comptroller.supplyCaps(address(cToken)),
            borrowCap: comptroller.borrowCaps(address(cToken))
        });
    }

    function cTokenMetadata(CToken cToken) public returns (CTokenMetadata memory) {
        Comptroller comptroller = Comptroller(address(cToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();
        return cTokenMetadataInternal(cToken, comptroller, priceOracle);
    }

    function cTokenMetadataAll(CToken[] calldata cTokens) external returns (CTokenMetadata[] memory) {
        uint cTokenCount = cTokens.length;
        require(cTokenCount > 0, "invalid input");
        CTokenMetadata[] memory res = new CTokenMetadata[](cTokenCount);
        Comptroller comptroller = Comptroller(address(cTokens[0].comptroller()));
        PriceOracle priceOracle = comptroller.oracle();
        for (uint i = 0; i < cTokenCount; i++) {
            require(address(comptroller) == address(cTokens[i].comptroller()), "mismatch comptroller");
            res[i] = cTokenMetadataInternal(cTokens[i], comptroller, priceOracle);
        }
        return res;
    }

    struct CTokenBalances {
        address cToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
        bool collateralEnabled;
        uint collateralBalance;
        uint nativeTokenBalance;
    }

    function cTokenBalances(CToken cToken, address payable account) public returns (CTokenBalances memory) {
        address comptroller = address(cToken.comptroller());
        bool collateralEnabled = Comptroller(comptroller).checkMembership(account, cToken);
        uint tokenBalance;
        uint tokenAllowance;
        uint collateralBalance;

        if (compareStrings(cToken.symbol(), "crFTM")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            CErc20 cErc20 = CErc20(address(cToken));
            EIP20Interface underlying = EIP20Interface(cErc20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(cToken));
        }

        if (collateralEnabled) {
            (, collateralBalance, , ) = cToken.getAccountSnapshot(account);
        }

        return CTokenBalances({
            cToken: address(cToken),
            balanceOf: cToken.balanceOf(account),
            borrowBalanceCurrent: cToken.borrowBalanceCurrent(account),
            balanceOfUnderlying: cToken.balanceOfUnderlying(account),
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance,
            collateralEnabled: collateralEnabled,
            collateralBalance: collateralBalance,
            nativeTokenBalance: account.balance
        });
    }

    function cTokenBalancesAll(CToken[] calldata cTokens, address payable account) external returns (CTokenBalances[] memory) {
        uint cTokenCount = cTokens.length;
        CTokenBalances[] memory res = new CTokenBalances[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            res[i] = cTokenBalances(cTokens[i], account);
        }
        return res;
    }

    struct AccountLimits {
        CToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    function getAccountLimits(Comptroller comptroller, address account) public returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0);

        return AccountLimits({
            markets: comptroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    function getClaimableSushiRewards(CSLPInterface[] calldata cTokens, address sushi, address account) external returns (uint[] memory) {
        uint cTokenCount = cTokens.length;
        uint[] memory rewards = new uint[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            uint balanceBefore = EIP20Interface(sushi).balanceOf(account);
            cTokens[i].claimSushi(account);
            uint balanceAfter = EIP20Interface(sushi).balanceOf(account);
            rewards[i] = sub_(balanceAfter, balanceBefore);
        }
        return rewards;
    }

    function getClaimableCompRewards(CCTokenInterface[] calldata cTokens, address comp, address account) external returns (uint[] memory) {
        uint cTokenCount = cTokens.length;
        uint[] memory rewards = new uint[](cTokenCount);
        for (uint i = 0; i < cTokenCount; i++) {
            uint balanceBefore = EIP20Interface(comp).balanceOf(account);
            cTokens[i].claimComp(account);
            uint balanceAfter = EIP20Interface(comp).balanceOf(account);
            rewards[i] = sub_(balanceAfter, balanceBefore);
        }
        return rewards;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
