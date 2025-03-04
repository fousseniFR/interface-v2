import React from 'react';
import { ETHER, Pair } from '@uniswap/sdk';
import { Currency, CurrencyAmount, Percent, Token } from '@uniswap/sdk-core';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { LockOutlined } from '@material-ui/icons';

import { useActiveWeb3React } from 'hooks';
import { WrappedCurrency } from 'models/types/Currency';
import CurrencyLogo from 'components/CurrencyLogo';
import { useCurrencyBalance } from 'state/wallet/hooks';
import CurrencySearchModal from 'components/CurrencySearchModal';
import { Box } from '@material-ui/core';
import NumericalInput from 'components/NumericalInput';
import { useTranslation } from 'react-i18next';
import './index.scss';
import DoubleCurrencyLogo from 'components/DoubleCurrencyLogo';
import { useUSDCPriceFromAddress } from 'utils/useUSDCPrice';

interface CurrencyInputPanelProps {
  value: string;
  onUserInput: (value: string) => void;
  onMax?: () => void;
  onHalf?: () => void;
  showMaxButton: boolean;
  showHalfButton?: boolean;
  label?: ReactNode;
  onCurrencySelect?: (currency: Currency) => void;
  currency?: WrappedCurrency | null;
  hideBalance?: boolean;
  pair?: Pair | null;
  hideInput?: boolean;
  otherCurrency?: Currency | null;
  fiatValue?: CurrencyAmount<Token> | null;
  priceImpact?: Percent;
  id: string;
  showCommonBases?: boolean;
  showCurrencyAmount?: boolean;
  disableNonToken?: boolean;
  showBalance?: boolean;
  renderBalance?: (amount: CurrencyAmount<Currency>) => ReactNode;
  locked?: boolean;
  hideCurrency?: boolean;
  centered?: boolean;
  disabled: boolean;
  shallow: boolean;
  swap: boolean;
  page?: string;
  bgClass?: string;
  color?: string;
  showETH?: boolean;
}

export default function CurrencyInputPanel({
  value,
  onUserInput,
  onMax,
  onHalf,
  showMaxButton,
  showHalfButton,
  onCurrencySelect,
  currency,
  otherCurrency,
  id,
  showCommonBases,
  showCurrencyAmount,
  disableNonToken,
  fiatValue,
  priceImpact,
  hideBalance = false,
  pair = null, // used for double token logo
  hideInput = false,
  locked = false,
  showBalance,
  hideCurrency = false,
  centered = false,
  disabled,
  shallow = false,
  swap = false,
  page,
  bgClass,
  color,
  showETH,
  ...rest
}: CurrencyInputPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { chainId, account } = useActiveWeb3React();
  const { t } = useTranslation();

  const nativeCurrency = chainId ? ETHER[chainId] : undefined;
  const ethBalance = useCurrencyBalance(account ?? undefined, nativeCurrency);
  const balance = useCurrencyBalance(
    account ?? undefined,
    currency?.isNative ? nativeCurrency : currency ?? undefined,
  );

  const { price: currentPrice } = useUSDCPriceFromAddress(
    currency?.address ?? currency?.wrapped?.address ?? '',
  );

  const valueAsUsd = useMemo(() => {
    if (!currentPrice || !value) {
      return 0;
    }

    return currentPrice * Number(value);
  }, [currentPrice, value]);

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false);
  }, [setModalOpen]);

  return (
    <Box className='v3-currency-input-panel'>
      {locked && (
        <Box className='v3-currency-input-lock-wrapper'>
          <LockOutlined />
          <small>
            Price is outside specified price range. Single-asset deposit only.
          </small>
        </Box>
      )}

      <Box id={id} className={`swapBox ${bgClass}`}>
        <Box mb={2}>
          <Box>
            <Box
              className={`currencyButton  ${'token-select-background-v3'}  ${
                currency ? 'currencySelected' : 'noCurrency'
              }`}
              onClick={() => {
                if (onCurrencySelect) {
                  setModalOpen(true);
                }
              }}
            >
              {currency ? (
                <Box className='flex w-100 justify-between items-center'>
                  <Box className='flex'>
                    {showETH ? (
                      <DoubleCurrencyLogo
                        size={25}
                        currency0={nativeCurrency}
                        currency1={currency}
                      />
                    ) : (
                      <CurrencyLogo
                        size={'25px'}
                        currency={currency as WrappedCurrency}
                      ></CurrencyLogo>
                    )}
                    <p className='text-primaryText'>{`${
                      showETH ? nativeCurrency?.symbol + '+' : ''
                    }${currency?.symbol}`}</p>
                  </Box>
                </Box>
              ) : (
                <p className='text-primaryText'>{t('selectToken')}</p>
              )}
            </Box>
          </Box>

          <Box className='inputWrapper'>
            <NumericalInput
              value={value}
              align='right'
              color={color}
              placeholder='0.00'
              onUserInput={(val) => {
                if (val === '.') val = '0.';
                onUserInput(val);
              }}
            />
          </Box>
        </Box>
        <Box className='flex justify-between'>
          <Box display='flex'>
            <small className='text-secondary'>
              {t('balance')}:{' '}
              {(showETH && ethBalance
                ? Number(ethBalance.toSignificant(5))
                : 0) + (balance ? Number(balance.toSignificant(5)) : 0)}
            </small>

            {account && currency && showHalfButton && (
              <Box className='maxWrapper' onClick={onHalf}>
                <small>50%</small>
              </Box>
            )}
            {account && currency && showMaxButton && (
              <Box className='maxWrapper' onClick={onMax}>
                <small>{t('max')}</small>
              </Box>
            )}
          </Box>

          <Box className='v3-currency-input-usd-value'>
            <small className='text-secondary'>
              ${valueAsUsd.toLocaleString('us')}
            </small>
          </Box>
        </Box>
      </Box>

      {onCurrencySelect && (
        <CurrencySearchModal
          isOpen={modalOpen}
          onDismiss={handleDismissSearch}
          onCurrencySelect={onCurrencySelect}
          selectedCurrency={currency}
          otherSelectedCurrency={otherCurrency}
          showCommonBases={showCommonBases}
          // TODO: Consider adding support for V3 Functionality
          // showCurrencyAmount={showCurrencyAmount}
          // disableNonToken={disableNonToken}
        />
      )}
    </Box>
  );
}
