pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

contract MockReference {
    mapping(string => ReferenceData) prices;

    /// A structure returned whenever someone requests for standard reference data.
    struct ReferenceData {
        uint256 rate; // base/quote exchange rate, multiplied by 1e18.
        uint256 lastUpdatedBase; // UNIX epoch of the last time when base price gets updated.
        uint256 lastUpdatedQuote; // UNIX epoch of the last time when quote price gets updated.
    }

    /// Returns the price data for the given base/quote pair. Revert if not available.
    function getReferenceData(string calldata _base, string calldata _quote)
        external
        view
        returns (ReferenceData memory)
    {
        _quote; // Do nothing.
        return prices[_base];
    }

    /// Similar to getReferenceData, but with multiple base/quote pairs at once.
    function getRefenceDataBulk(string[] calldata _bases, string[] calldata _quotes)
        external
        view
        returns (ReferenceData[] memory)
    {
        _quotes; // Do nothing.
        ReferenceData[] memory data = new ReferenceData[](_bases.length);
        for (uint256 i = 0; i < _bases.length; i++) {
            data[i] = prices[_bases[i]];
        }
        return data;
    }

    function setReferenceData(
        string calldata _base,
        uint256 rate,
        uint256 lastUpdatedBase,
        uint256 lastUpdatedQuote
    ) external {
        prices[_base] = ReferenceData(rate, lastUpdatedBase, lastUpdatedQuote);
    }
}
